import { Id, DataMap } from './lib'
import { Mediator, MConvener, MAttendee, MPeer } from './Mediator'
import { Observable, Subject, merge, ReplaySubject, EMPTY, of, from, fromEvent } from 'rxjs'
import { toArray, filter, mergeMap, map, share, expand, startWith, takeUntil, finalize, shareReplay, tap, catchError } from 'rxjs/operators'
import Committer from './Committer'
import { List, Map, Set } from 'immutable'
import MonoidData from './MonoidData'
import Head from './Head'
import { Commit } from './AtomSpace'
import { BuiltWorld } from './shape/BuiltWorld'
import { AtomRef } from './atoms'
import { inspect, isArray } from 'util'
import { Nodes } from './shape/common'
import { Loader } from './Store'
import { Timer } from './Timer'
import { isString } from './util'

const log = console.debug;
const logChat = (id0:Id, m:unknown, id1:Id) => log('CHAT', id0, '->', inspect(m, {colors:true}), '->', id1);

const $Ahoy = Symbol('$Ahoy')

export type Machine = {
  id: Id,
  head: Head<DataMap>,
  log$: Observable<Log>
}

type CommitFac = (h: Head<DataMap>) => Committer<DataMap>

export type Log = [[string, unknown]|false, AtomRef<DataMap>?]

export class MachineSpace<N extends Nodes> {
  private readonly world: BuiltWorld<N>
  private readonly loader: Loader
  private readonly mediator: Mediator
  private readonly timer: Timer

  private readonly _commit$ = new ReplaySubject<Commit<DataMap>>(1)
  readonly commit$ = this._commit$;

  private machines: Map<Id, Promise<Machine>>
  private _machine$: Subject<Machine>
  readonly machine$: Observable<Machine>

  private _signal$: Observable<Signal>

  private readonly MD = new MonoidData();

  constructor(
    world: BuiltWorld<N>,
    loader: Loader,
    mediator: Mediator,
    timer: Timer,
    signal$: Observable<Signal>
  ) {
    this.world = world;
    this.loader = loader;
    this.mediator = mediator;
    this.timer = timer;

    this.machines = Map();
    this._machine$ = new Subject();
    this.machine$ = this._machine$;

    this._signal$ = signal$;
    signal$.pipe(filter(s => s.stop))
      .subscribe(() => {
        this._machine$.complete();
        this._commit$.complete();
      });
  }

  summon(ids: Set<Id>): Observable<Machine> {
    const _this = this;
    
    const summoned = ids.map(id => {
      const found = _this.machines.get(id);
      if(found) {
        return [false, id, found] as const;
      }
      else {
        const loading = _this.loader.load(Set([id]));

        //TODO should check loaded phases against schema guards!

        return [
          <boolean>true,
          id,
          loading.then(loaded => {
            const phase = loaded.get(id)!;
            
            const machine = _this
              .runMachine(
                id,
                phase,
                new Head(_this._commit$),
                h => new Committer<DataMap>(_this.MD, h),
                _this._signal$
              );

            _this._machine$.next(machine);

            return machine;
          })
        ] as const;
      }
    })

    const toAdd = summoned
      .filter(([isNew]) => isNew)
      .map(([, id, loading]) => <[Id, Promise<Machine>]>[id, loading]);
    
    this.machines = _this.machines.merge(Map(toAdd));

    return merge(...(summoned.map(
      ([,, loading]) => from(loading)
    )));
  }



  private runMachine(
    id: Id,
    state: unknown,
    head: Head<DataMap>,
    commitFac: CommitFac,
    signal$: Observable<Signal>
  ): Machine
  {
    const _this = this;
    
    const kill$ = signal$.pipe(filter(s => s.stop), share());

    const log$ = of(<Log>[state]).pipe(
      expand(([p]) => {
        log('PHASE', id, inspect(p, {colors:true}));

        if(!p) return EMPTY;

        const [path, data] = p;

        return from((async () => {
          const committer = commitFac(head);

          try {
            const { guard, fac, handler } = _this.world.read(path);

            if(!handler) throw Error(`No handler at path ${path}`);
            if(!fac) throw Error(`No fac at path ${path}`);
            if(!guard) throw Error(`No guard at path ${path}`);

            //guard here
            //...

            const coreCtx = coreContext(id, committer);
            const ctx = fac(coreCtx);
            const out = await handler(ctx, data);

            if(isPhase(out)) {
              const ref = await committer.complete(Map({ [id]: out }));
              return <Log>[out, ref];
            }

            if(out === false) {
              return <Log>[out];
            }

            throw Error(`Handler output no good: ${out}`);
          }
          catch(e) {
            committer.abort();
            console.error(e);
            return <Log>[false];
            // throw e;
          }
        })())
      }),
      startWith(<Log>[state, new AtomRef()]),
      filter((l) => !!l[0]),
      takeUntil(kill$),
      finalize(() => head.release()),
      shareReplay(1),
    );

    const machine = {
      id,
      head,
      log$
    };

    return machine;


    function isPhase(p: unknown): p is [string, unknown] {
      return isArray(p)
        && p.length > 0
        && isString(p[0])
        && !!_this.world.read(p[0]).handler;
    }

    function coreContext(id: Id, commit: Committer<DataMap>): unknown {
      return {
        id: id,

        timer: _this.timer,

        watch(ids: Id[]): Observable<[Id, unknown]> {
          return _this.summon(Set(ids)) //TODO if the same thing is watched twice, commits will be added doubly
            .pipe(
              mergeMap(m => m.log$.pipe(
                map(l => <[Id, Log]>[m.id, l])
              )),
              tap(([,[,r]]) => { //gathering all watched atomrefs here into mutable Commit
                if(r) commit.add(List([r]))
              }),
              mergeMap(([id, [p]]) => p ? [<[Id, unknown]>[id, p]] : []),
            );
        },

        attend<R>(attend: Attendee<R>) {
          return _this.mediator.attend(machine, {
            id,
            receive([mid, m], peers) {
              if(isArray(m) && m[0] === $Ahoy) {
                Committer.combine(new MonoidData(), [commit, <Committer<DataMap>>m[1]]);
                m = m[2];
              }

              logChat(mid, m, id);

              const proxied = peers.map(p => <Peer>({
                chat(m) {
                  logChat(id, m, p.id);
                  return p.chat([[$Ahoy, commit, m]]);
                }
              }));
              return attend.receive(m, mid, proxied);
            }
          });
        },

        async convene<R>(ids: Id[], convene: Convener<R>) {
          const m$ = _this.summon(Set(ids));
          const ms = await m$.pipe(toArray()).toPromise(); //summoning should be cancellable (from loader?)

          const result = await _this.mediator
            .convene({
              id,
              receive(peers) {
                const proxied = peers.map(p => <Peer>({
                  chat(m) {
                    logChat(id, m, p.id);
                    return p.chat([[$Ahoy, commit, m]]);
                  }
                }));
                return convene.receive(proxied);
              }
            }, Set(ms));

          return result;
        }
      };
    }
  }
}

export type Signal = {
  stop: boolean
}

export interface Peer {
  chat(m: unknown): false|[unknown]
}

export interface Convener<R = unknown> {
  receive(peers: Set<Peer>): R
}

export interface Attendee<R = unknown> {
  receive(m: unknown, id: Id, peers: Set<Peer>): [R]|[R, unknown]
}

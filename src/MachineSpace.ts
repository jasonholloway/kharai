import { Id, DataMap } from './lib'
import { Mediator } from './Mediator'
import { Observable, Subject, merge, ReplaySubject, EMPTY, of, from } from 'rxjs'
import { toArray, filter, mergeMap, map, share, expand, startWith, takeUntil, finalize, shareReplay, tap } from 'rxjs/operators'
import Committer from './Committer'
import { List, Map, Seq, Set } from 'immutable'
import MonoidData from './MonoidData'
import Head from './Head'
import { Commit } from './AtomSpace'
import { BuiltWorld } from './shape/BuiltWorld'
import { AtomRef } from './atoms'
import { inspect, isArray, isFunction } from 'util'
import { Nodes, separator } from './shape/common'
import { Loader } from './Store'
import { Timer } from './Timer'
import { isString } from './util'

const log = console.debug;
// const logChat = (id0:Id[], id1:Id, m:unknown) => log('CHAT', ...id0, '->', id1, inspect(m, {colors:true}));

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
    let sideData = <unknown>undefined;
    let v = -1;
    
    const kill$ = signal$.pipe(filter(s => s.stop), share());

    const log$ = of(<Log>[state]).pipe(
      expand(([p]) => {
        v++;
        
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

            //TODO
            //build phase helper (or rather, use singleton) here

            const coreCtx = coreContext(id, v, committer);
            const ctx = { ...<object>fac(coreCtx), and: createPhaseFacTree() };
            const out = await handler(ctx, data);
            // console.debug('OUT', id, inspect(out,{colors:true}))

            if(isPhase(out)) {
              const ref = await committer.complete(Map({ [id]: out }));
              return <Log>[out, ref];
            }

            if(out === false) {
              return <Log>[out];
            }

            throw Error(`Handler output no good: ${inspect(out,{depth:4})}`);
          }
          catch(e) {
            committer.abort();
            console.error(e);

            //false here kills without committing
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

    function coreContext(id:Id, v:number, commit:Committer<DataMap>): unknown {
      return {
        id: id,

        timer: _this.timer,

        side: {
          get() {
            return sideData;
          },
          set(d:unknown) {
            sideData = d;
          }
        },

        isFresh() {
          return v == 0;
        },

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

        attend<R>(arg: Attendee<R>|AttendedFn<R>) {
          const attended = isAttendee(arg) ? arg.attended : arg;

          return _this.mediator.attend(machine, {
            id,
            attended([mid, m], peers) {
              //here the attendee is receiving a message from its convener

              if(isArray(m) && m[0] === $Ahoy) {
                Committer.combine(new MonoidData(), [commit, <Committer<DataMap>>m[1]]);
                m = m[2];
              }

              // logChat([mid], id, 'C>A', m);

              const proxied = peers.map(p => <Peer>({
                id: p.id,
                chat(m) {
                  // logChat(['A:'+id], 'A:'+p.id, m);
                  return p.chat([[$Ahoy, commit, m]]);
                }
              }));

              const result = attended(m, mid, proxied);

              // if(result[1]) logChat(['A:'+id], 'C:'+mid, result[1]);

              // if(result[1]) logChat(['AR',id], result[1], mid);

              return result ?? false;
            }
          });

          function isAttendee(v: unknown): v is Attendee<R> {
            return !!(<any>v).attended;
          }
        },

        async convene<R>(ids: Id[], arg: Convener<R>|ConvenedFn<R>) {
          const convened = isConvener(arg) ? arg.convened : arg;
          
          const m$ = _this.summon(Set(ids));
          const ms = await m$.pipe(toArray()).toPromise(); //summoning should be cancellable (from loader?)

          const result = await _this.mediator
            .convene({
              id,
              convened(peers) {
                //here the convener is given some peers to chat to
                
                const proxied = peers.map(p => <Peer>({
                  id: p.id,
                  chat(m) {
                    // logChat(['C:'+id], 'A:'+p.id, m);
                    return p.chat([[$Ahoy, commit, m]]);
                  }
                }));

                const result = convened(proxied);

                // logChat([...peers.map(p => p.id)], result, id);

                return result;
              }
            }, Set(ms));

          return result;

          function isConvener(v: unknown): v is Convener<R> {
            return !!(<any>v).convened;
          }
        }
      };
    }

    function createPhaseFacTree(): object {
      return _create(
        List(),
        List(_this.world.reg.getHandlerPaths()).map(p => List(p.split(separator)))
      );

      function _create(route: List<string>, paths: List<List<string>>): object {
        const routePath = route.join(separator);
        
        return Object.assign(
          ((d:unknown) => [routePath, d]),
          paths
            .filter(p => !p.isEmpty())
            .groupBy(p => p.first()!)
            .map(ps => ps.map(p => p.skip(1)).toList())
            .reduce((ac, ps, k) => ({
                ...ac,
                [k]: _create(route.concat([k]), ps)
              }),
              <{[k:string]:unknown}>{}
            )
        );
      }
    }
  }
}

export type Signal = {
  stop: boolean
}



export interface Peer {
  id: Id,
  chat(m: unknown): false|readonly [unknown]
}


export interface Convener<R = unknown> {
  convened: ConvenedFn<R>
}

export type ConvenedFn<R> = (peers: Set<Peer>) => R;


export interface Attendee<R = unknown> {
  attended: AttendedFn<R>
}

export type AttendedFn<R> = (m:unknown, mid:Id, peers:Set<Peer>) => ([R]|[R,unknown]|false|undefined);


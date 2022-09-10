import { Id, DataMap } from './lib'
import { Mediator } from './Mediator'
import { Observable, Subject, pipe, merge, ReplaySubject, EMPTY, of, from, Observer } from 'rxjs'
import { concatMap, toArray, filter, mergeMap, map, share, expand, takeUntil, finalize, shareReplay, tap } from 'rxjs/operators'
import Commit from './Committer'
import { Map, OrderedSet, Set } from 'immutable'
import MonoidData from './MonoidData'
import Head from './Head'
import { Lump } from './AtomSpace'
import { BuiltWorld, Found } from './shape/BuiltWorld'
import { AtomRef } from './atoms'
import { inspect, isArray, isFunction } from 'util'
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

export type Log = {
  state: [string, unknown]|false,
  phase?: Found,
  atoms: OrderedSet<AtomRef<DataMap>>
}


export class MachineSpace<N> {
  private readonly world: BuiltWorld<N>
  private readonly loader: Loader
  private readonly mediator: Mediator
  private readonly timer: Timer

  private readonly _lump$ = new ReplaySubject<Lump<DataMap>>(1)
  readonly commit$ = this._lump$;

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
        this._lump$.complete();
      });
  }

  summon(ids: Set<Id>): Observable<Machine> {
    const _this = this;
    
    const summoned = ids.map(id => {
      const found = _this.machines.get(id);
      if(found) {
        return [id, found] as const;
      }
      else {
        return [
          id,
          _this.loader
            .load(Set([id]))
            .then(loaded => {
              const phase = loaded.get(id)!;

              const machine = _this
                .runMachine(
                  id,
                  phase,
                  _this._signal$,
                  _this._lump$
                );

              _this._machine$.next(machine);

              return machine;
            }),
          true
        ] as const;
      }
    })

    const toAdd = summoned
      .filter(([,,isNew]) => isNew)
      .map(([id, loading]) => <[Id, Promise<Machine>]>[id, loading]);
    
    this.machines = _this.machines.merge(Map(toAdd));

    return merge(...(summoned.map(
      ([,loading]) => from(loading)
    )));
  }



  private runMachine(
    id: Id,
    initialState: unknown,
    signal$: Observable<Signal>,
    lump$: Observer<Lump<DataMap>>
  ): Machine
  {
    const _this = this;
    let sideData = <unknown>undefined;
    let v = -1;

    const head = new Head<DataMap>(rs => new Commit<DataMap>(this.MD, lump$, rs));
    
    const kill$ = signal$.pipe(filter(s => s.stop), share());

    type GetNext = ()=>Promise<false|[false|[string,unknown],true?]>;
    type Tup = { log?: Log, next: GetNext };

    const log$ = of(<Tup>{ next: async ()=>[initialState] }).pipe(
      expand(tup => of(tup).pipe(
        mergeMap(async ({next}) => {
          v++;

          const result = await next();

          if(!result) {
            head.reset();
            return EMPTY;
          }

          const [out,save] = result;

          if(out === false) {
            // what happens if we've accumulated upstreams and returned false, eh?
            if(save) await head.write(_this.MD.zero, 0);
            return EMPTY;
          }

          if(!isPhase(out)) throw Error(`State not in form of phase: ${inspect(out)}`);
          const [path, data] = out;

          const phase = _this.world.read(path);

          const { guard, fac, handler } = phase;
          if(!handler) throw Error(`No handler at path ${path}`);
          if(!fac) throw Error(`No fac at path ${path}`);
          if(!guard) throw Error(`No guard at path ${path}`);

          //!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
          //guard here TODO TODO TODO TODO
          //!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

          // output has now been thoroughly frisked - time to save
          if(save) await head.write(Map({ [id]: out }), 1);

          //line up next
          return of(<Tup>{
            log: { state:out, phase, atoms:head.refs() },
            next: async () => {
              try {
                const ctx = fac(coreContext(id, v, head.commit()));
                const out = await handler(ctx, data);
                return [out, true];
              }
              catch(e) {
                console.error(e);
                return false;
              }
            }
          });
        }),
        concatMap(o => o)
      )),
      concatMap(({log}) => log ? [log] : []),

      tap(({state}) => log('ACT', id, inspect(state, {colors:true}))),
      finalize(() => log('END', id)),

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

    function coreContext(id:Id, v:number, commit:Commit<DataMap>): unknown {
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

              mergeMap(([id, { phase, state, atoms }]) =>
                (state && phase && phase.projector)
                  ? phase.projector(state[1]).map(v => [id, atoms, v] as const)
                  : []),

              //gathering atomrefsof all visible projections into mutable Commit
              map(([id, atoms, v]) => {
                commit.addUpstreams(atoms);
                return [id, v];
              })
            );
        },

        watchRaw(ids: Id[]): Observable<[Id, unknown]> {
          return _this.summon(Set(ids)) //TODO if the same thing is watched twice, commits will be added doubly
            .pipe(
              mergeMap(m => m.log$.pipe(
                map(l => <[Id, Log]>[m.id, l])
              )),
              tap(([,{ atoms }]) => { //gathering all watched atomrefs here into mutable Commit
                commit.addUpstreams(atoms)
              }),
              mergeMap(([id, { state:p }]) => p ? [<[Id, unknown]>[id, p]] : []),
            );
        },

        attend<R>(arg: Attendee<R>|AttendedFn<R>) {
          const attended = isAttendee(arg) ? arg.attended : arg;

          return _this.mediator.attend(machine, {
            id,
            attended([mid, m], peers) {
              //here the attendee is receiving a message from its convener

              if(isArray(m) && m[0] === $Ahoy) {
                Commit.conjoin(new MonoidData(), [commit, <Commit<DataMap>>m[1]]);
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


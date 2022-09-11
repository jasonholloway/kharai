import { Id, DataMap } from './lib'
import { MAttendee } from './Mediator'
import { Observable, Subject, merge, ReplaySubject, EMPTY, of, from, Observer } from 'rxjs'
import { concatMap, toArray, filter, mergeMap, map, share, expand, takeUntil, finalize, shareReplay, tap, catchError } from 'rxjs/operators'
import Commit from './Committer'
import { Map, OrderedSet, Set } from 'immutable'
import MonoidData from './MonoidData'
import Head from './Head'
import { Lump } from './AtomSpace'
import { BuiltWorld, Found } from './shape/BuiltWorld'
import { AtomRef } from './atoms'
import { inspect, isArray, isFunction } from 'util'
import { Loader } from './Store'
import { isString } from './util'
import { Run, RunCtx, RunSpace } from './RunSpace'

const log = console.debug;
// const logChat = (id0:Id[], id1:Id, m:unknown) => log('CHAT', ...id0, '->', id1, inspect(m, {colors:true}));

const $Ahoy = Symbol('$Ahoy')

export type Machine = {
  id: Id,
  log$: Observable<Log>
}

type _Machine = Machine & {
  head: Head<DataMap>,
  run: Run
}

export type Log = {
  state: [string, unknown]|false,
  phase?: Found,
  atoms: OrderedSet<AtomRef<DataMap>>
}


export class MachineSpace<N> {
  private readonly world: BuiltWorld<N>
  private readonly loader: Loader
  private readonly runs: RunSpace;

  private readonly _lump$ = new ReplaySubject<Lump<DataMap>>(1)
  readonly commit$ = this._lump$;

  private machines: Map<Id, Promise<_Machine>>
  private _machine$: Subject<Machine>
  readonly machine$: Observable<Machine>

  private _signal$: Observable<Signal>

  private readonly MD = new MonoidData();

  constructor(
    world: BuiltWorld<N>,
    loader: Loader,
    runs: RunSpace,
    signal$: Observable<Signal>
  ) {
    this.world = world;
    this.loader = loader;
    this.runs = runs;

    this.machines = Map();
    this._machine$ = new Subject();
    this.machine$ = this._machine$;

    //telling all the machines to shut up shop is our responsibility
    //we also need to deactivate ourself
    this._signal$ = signal$;
    signal$.pipe(filter(s => s.stop))
      .subscribe(() => {
        this._machine$.complete();
        this._lump$.complete();
      });
  }

  async runArbitrary<R>(fn: (x:MachineSpaceCtx)=>Promise<R>) {
    throw 123;
  }

  
  
  summon(ids: Set<Id>): Observable<Machine> {
    return this._summon(ids);
  }

  private _summon(ids: Set<Id>): Observable<_Machine> {
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
      .map(([id, loading]) => <[Id, Promise<_Machine>]>[id, loading]);
    
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
  ): _Machine
  {
    const _this = this;
    const run = this.runs.newRun();
    const head = new Head<DataMap>(rs => new Commit<DataMap>(this.MD, lump$, rs));
    
    const kill$ = signal$.pipe(filter(s => s.stop), share());

    type GetNext = ()=>Promise<false|[false|[string,unknown],true?]>;
    type Step = { log?: Log, v: number, next: GetNext };

    const log$ = of(<Step>{ v: 0, next: async ()=>[initialState] }).pipe(
      expand(step => of(step).pipe(
        mergeMap(async ({v, next}) => {
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
          return of(<Step>{
            v: v + 1,
            log: { state:out, phase, atoms:head.refs() },
            next: async () => {
              try {
                const out = await run.run(x => {
                  const ctx = fac(machineCtx(x, id, v, head.commit()));
                  return handler(ctx, data);
                });
                
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

      //BELOW IS RUBBISH
      catchError(e => {
        console.error(e);
        return EMPTY;
      }),

      tap(({state}) => log('ACT', id, inspect(state, {colors:true}))),
      finalize(() => log('END', id)),

      takeUntil(kill$),
      finalize(() => head.release()), //doesn't actually do anything...

      shareReplay(1),
    );

    return <_Machine>{
      id,
      head,
      log$,
      run
    };


    function isPhase(p: unknown): p is [string, unknown] {
      return isArray(p)
        && p.length > 0
        && isString(p[0])
        && !!_this.world.read(p[0]).handler;
    }

    function machineSpaceCtx(x: RunCtx): MachineSpaceCtx {
      //here we summon peerRuns
      return {
        ...x
      };
    }


    function machineCtx(x: MachineSpaceCtx, id:Id, v:number, commit:Commit<DataMap>): MachineCtx {
      return {
        ...x,
        
        id: id,

        isFresh() {
          return v == 0;
        },

        attend<R>(arg: Attendee<R>|AttendedFn<R>) {
          const attended = isAttendee(arg) ? arg.attended : arg;

          return x.attend(<MAttendee<R>>{

            info: packInfo(id),

            attended(m, info, peers) {
              //here the attendee is receiving a message from its convener

              if(isArray(m) && m[0] === $Ahoy) {
                Commit.conjoin(new MonoidData(), [commit, <Commit<DataMap>>m[1]]);
                m = m[2];
              }

              // logChat([mid], id, 'C>A', m);

              const proxied = peers.map(p => <Peer>({
                id: unpackInfo(info),
                chat(m) {
                  // logChat(['A:'+id], 'A:'+p.id, m);
                  return p.chat([[$Ahoy, commit, m]]);
                }
              }));

              const result = attended(m, unpackInfo(info), proxied);

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
          const fn = isConvener(arg) ? arg.convened : arg;
          
          const peerRuns =
            await _this._summon(Set(ids))
              .pipe(
                map(m => m.run),
                toArray()
              )
              .toPromise(); //summoning should be cancellable (from loader?)

          return await x.convene(
            peerRuns,
            {
              info: packInfo(id),

              //talk to convened peers
              convened(peers) {
                return fn(peers.map(p => <Peer>({
                  id: unpackInfo(p.info),
                  chat(m) {
                    return p.chat([[$Ahoy, commit, m]]);
                  }
                })));
              }
            });

          function isConvener(v: unknown): v is Convener<R> {
            return !!(<any>v).convened;
          }
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


      };

      function packInfo(id: string): unknown {
        return { id };
      }

      function unpackInfo(info: unknown): string|undefined {
        return (<{ id?: string }|undefined>info)?.id;
      }
    }
  }
}


export type Signal = {
  stop: boolean
}


export interface Peer {
  id?: Id,
  chat(m: unknown): false|readonly [unknown]
}


export interface Convener<R = unknown> {
  convened: ConvenedFn<R>
}

export type ConvenedFn<R> = (peers: Set<Peer>) => R;


export interface Attendee<R = unknown> {
  attended: AttendedFn<R>
}

export type AttendedFn<R> = (m:unknown, mid:Id|undefined, peers:Set<Peer>) => ([R]|[R,unknown]|false|undefined);


export type MachineSpaceCtx = Extend<RunCtx, {
  attend: <R>(attend: Attendee<R>|AttendedFn<R>) => Promise<false|[R]>
  convene: <R>(ids: string[], convene: Convener<R>|ConvenedFn<R>) => Promise<R>
}>;

export type MachineCtx = Extend<MachineSpaceCtx, {
  id: string
  isFresh: () => boolean
  attend: <R>(attend: Attendee<R>|AttendedFn<R>) => Promise<false|[R]>
  convene: <R>(ids: string[], convene: Convener<R>|ConvenedFn<R>) => Promise<R>
  watch: (ids: string[]) => Observable<readonly [string, unknown]>
  watchRaw: (ids: string[]) => Observable<readonly [string, unknown]>
}>;


type Extend<A, B> = Omit<A, keyof B> & B;

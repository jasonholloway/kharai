import { Id, DataMap, PhaseData } from './lib'
import { MAttendee } from './Mediator'
import { Observable, Subject, EMPTY, of } from 'rxjs'
import { concatMap, filter, mergeMap, share, expand, takeUntil, finalize, shareReplay, catchError, map } from 'rxjs/operators'
import { Map, Seq, Set } from 'immutable'
import { BuiltWorld, Found } from './shape/BuiltWorld'
import { AtomRef } from './atoms'
import { inspect, isArray, isFunction } from 'util'
import { Loader } from './Store'
import { isString } from './util'
import { Run, RunCtx, RunSpace } from './RunSpace'
import { formPath } from './shape/common'
import { PreExpand } from './guards/Guard'
import { $self } from './shapeShared'
import * as NodeTree from './shape/NodeTree'
import * as RelPaths from './shape/RelPaths'
import * as PhaseHelper from './shape/PhaseHelper'
import * as RefHelper from './shape/RefHelper'

const log = console.debug;

export const $skip = Symbol('skip')

export type Machine = {
  id: Id,
  log$: Observable<Log>
}

type _Machine = Machine & {
  run: Run<DataMap,Frisked[]>
}

export type Frisked = { data:PhaseData, phase:Found };

export type Log = {
  data: [string, unknown],
  phase: Found,
  atom: AtomRef<DataMap>
}


export class MachineSpace<N,O,NT=NodeTree.Form<N>> {
  
  private readonly world: BuiltWorld<N,O>
  private readonly loader: Loader
  private readonly runs: RunSpace<DataMap,Frisked[]>;

  private machines: Map<Id, _Machine>
  private _machine$: Subject<Machine>
  readonly machine$: Observable<Machine>

  private _signal$: Observable<Signal>

  constructor(
    world: BuiltWorld<N,O>,
    loader: Loader,
    runs: RunSpace<DataMap,Frisked[]>,
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
      .subscribe(() => this._machine$.complete());
  }

  summon(ids: Set<Id>): Set<Machine> {
    return this._summon(ids);
  }

  async runArbitrary<R>(fn: (x:ClientCtx<NT,O>)=>Promise<R>): Promise<R> {
    const result = await this.runs.newRun()
      .run(async x => {
        const ctx = this.clientCtx(this.machineSpaceCtx(x));
        const r = await fn(ctx)
        return [[Map(),0], [], r];
      });

    if(!result) throw 'THIS SHOULD NEVER HAPPEN';

    return result[1];
  }

  private _summon(ids: Set<Id>): Set<_Machine> {
    //todo: load all ids up top as batch
    //...
    const [all, gathered] = ids.toSeq()
      .reduce<[Map<string,_Machine>,Set<_Machine>]>(
        ([all, gathered], id) => {

          const found = all.get(id, false);

          if(found) {
            return [all, gathered.add(found)];
          }
          else {
            const machine = this.runMachine(id, this._loadData(id), this._signal$);

            this._machine$.next(machine);

            return [all.set(id, machine), gathered.add(machine)];
          }
        },

        [this.machines, Set()]
      );

    this.machines = all;

    return gathered;
  }

  private async _loadData(id: Id): Promise<unknown> {
    const { world } = this;
    
    const loaded = await this.loader.load(Set([id]));
    return loaded.get(id) || _synth(id);

    function _synth(id: Id): unknown {
      const matched = /^@([\w_]+)(,([^,]*))*/.exec(id);

      if(matched) {
        let path = matched[1];

        const candidates = Seq([
          path,
          formPath([path, '$summon'])
        ]);

        for(const p of candidates) {

          const f = world.read(p);

          if(f && f.handler) {
            return matched
              .slice(2)
              .reduce((ac,v,i) => {
                if(i % 2 == 0) {
                  return ac
                }
                else {
                  return [...ac, v];
                }
              }, [p]);
          }
        }
      }

      return ['*_boot'];
    }
  }

  

  private runMachine(
    id: Id,
    loadingData: Promise<unknown>,
    signal$: Observable<Signal>,
  ): _Machine
  {
    const _this = this;

    const run = this.runs.newRun();
    
    const kill$ = signal$.pipe(filter(s => s.stop), share());

    type GetNext = ()=>Promise<[AtomRef<DataMap>,Frisked]|false>;
    type Step = { log?: Log, v: number, next: GetNext };

    const loadingPhase = run.run(async () => {
      const data = friskData(await loadingData);
      return [false, [data], data];
    });

    const log$ = of(<Step>{ v:-1, next: () => loadingPhase }).pipe(
      expand(step => of(step).pipe(
        mergeMap(async ({v, next}) => {
          
          const result = await next();
          if(result === false) return EMPTY;

          const [atom, { data, phase }] = result;

          return of(<Step>{
            v: v + 1,
            log: { atom, data, phase },
            next: () => run.run(async x => {
              try {
                const { fac, handler } = phase;
                
                const ctx = fac!(machineCtx(this.machineSpaceCtx(x, id), id, v));
                const out = await handler!(ctx, data[1]);

                if(out === $skip) return [[Map(),0], [], result[1]];

                if(out === false) return false;
                
                const frisked = friskData(out);
                log('ACT', id, inspect(frisked.data, {colors:true}));

                return [[Map([[id, frisked]]),1], [frisked], frisked];
              }
              catch(e) {
                console.error(e);
                return false;
              }
            })
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

      // tap(({data}) => log('ACT', id, inspect(data, {colors:true}))),
      finalize(() => log('END', id)),

      takeUntil(kill$),
      finalize(() => run.complete()),

      shareReplay(1),
    );

    return <_Machine>{
      id,
      log$,
      run
    };

    function friskData(data: unknown): Frisked {
      if(isPhaseData(data)) {
        const path = data[0];

        const phase = _this.world.read(path);

        const { guard, fac, handler } = phase;
        if(!guard) throw Error(`No guard at path ${path}`);
        if(!handler) throw Error(`No handler at path ${path}`);
        if(!fac) throw Error(`No fac at path ${path}`);

        //TODO
        //apply guard here!!!

        return { data, phase };
      }

      throw Error(`Data failed frisk! Wrongly shaped: ${data}`);
    }

    function isPhaseData(p: unknown): p is PhaseData {
      return Array.isArray(p)
        && p.length > 0
        && isString(p[0]);
    }


    function machineCtx(x: MachineSpaceCtx, id: Id, v: number): MachineCtx<NT,string[],O> {
      return {
        ...x,
        
        id: id,

        isFresh() {
          return v == -1;
        },

        ..._this.pathCtx()
      };
    }
  }

  private pathCtx(): PathCtx<NT,string[],O> {
    throw 123;
  }

  private clientCtx(x: MachineSpaceCtx): ClientCtx<NT,O> {
    return {
      ...x,
      ...this.pathCtx()
    };
  }

  private machineSpaceCtx(x: RunCtx<DataMap,Frisked[]>, id?: Id): MachineSpaceCtx {
    const _this = this;
    
    return {
      ...x,

      attend<R>(arg: Attendee<R>|AttendedFn<R>) {
        const attended = isAttendee(arg) ? arg.attended : arg;

        return x.attend(<MAttendee<R>>{

          info: packInfo(id),

          attended(m, info, peers) {
            return attended(m, unpackInfo(info), peers.map(p => <Peer>({
              id: unpackInfo(info),
              chat(m) { return p.chat(m); }
            }))) ?? false;
          }
        });

        function isAttendee(v: unknown): v is Attendee<R> {
          return !!(<any>v).attended;
        }
      },

      async convene<R>(ids: Id[], arg: Convener<R>|ConvenedFn<R>) {
        const convened = isConvener(arg) ? arg.convened : arg;

        const peerRuns = _this
          ._summon(Set(ids))
          .toArray()
          .map(m => m.run);

        return await x.convene(
          peerRuns,
          {
            info: packInfo(id),

            convened(peers) {
              return convened(peers.map(p => <Peer>({
                id: unpackInfo(p.info),
                chat(m) { return p.chat(m); }
              })));
            }
          });

        function isConvener(v: unknown): v is Convener<R> {
          return !!(<any>v).convened;
        }
      },

      watch(id: Id): Observable<unknown> {
        return of(..._this._summon(Set([id])))
          .pipe(
            mergeMap(m => x.track(m.run)
              .pipe(concatMap(fs => fs))),
            mergeMap(({phase:{projector}, data:[,d]}) =>
              projector ? projector(d) : []
              )
          );
      },

      watchRaw(id: Id): Observable<PhaseData> {
        return of(..._this._summon(Set([id])))
          .pipe(
            mergeMap(m => x.track(m.run)
              .pipe(concatMap(fs => fs))),
            map(f => f.data)
          );
      }
    };

    function packInfo(id?: string): unknown {
      return id ? { id } : undefined;
    }

    function unpackInfo(info: unknown): string|undefined {
      return (<{ id?: string }|undefined>info)?.id;
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


export type MachineSpaceCtx = Extend<RunCtx<DataMap,Frisked[]>, {
  attend: <R>(attend: Attendee<R>|AttendedFn<R>) => Promise<false|[R]>
  convene: <R>(ids: string[], convene: Convener<R>|ConvenedFn<R>) => Promise<R>
  watch: (id: Id) => Observable<unknown>
  watchRaw: (id: Id) => Observable<PhaseData>
}>;


//PathCtx below to build up its own XAs
//taking weight away from Impls
//and making them available to clients

//how about, instead of taking N directly
//a predigested, pre-walked structure could be consumed
//NodeTree and PathList
//the NodeTree would be created by Impls as part of its walk
//and then mapped into the Impls shape, with each leaf projected via below function

//clients need runctx
//machines need machinectx
//these are special additions mixed in based on path
//but not in the tree (???)
//
//why couldn't the special contexts appear as an XA?
//because they have fancy types(??)
//but other nodes could have fancy types perhaps?
//well, actually, they couldn't
//because we would need type functions
//so they have to be hardcoded
//but this is fine
//
//but this the rub: our context layering has to depend on the full path
//and so we don't have MachineCtx and ClientCtx exactly
//but rather the same layering,but with additional options
//
//if we want to extend the possiblities for machines, we must put our extensions in the M subtree
//and when we run as a client these extensions won't be offered
//
//eg id and isFresh make no sense to a client
//
//but all share root context without specialisations
//this root context will effectively be the bare RunCtx
//like the layering should be done as part of the walking of the tree
//and the RunCtx root is applied as part ofthis walking, as opposed to being a fixture under _everything_
//(it still effectively will be of course)
//
//special machine phases can live on a subtree under I or similar
//these won't pull in any extended context at all
//though they might still want to take the root machine context
//so they should be a subtree under M: say: M_*_boot 
//
//and when machine phases are saved, jthe leading M wil be chopped, leaving just *_boot, *_wait
//
//SO, TODO:
//the building up of the type of a situational context (the PathCtx?)
//should have hard-coded rules, so that special contexts are injected at certain points
//at the root, we have the RunCtx
//at M, we have the MachineCtx
//at C, do we even have anything extra to add? Not really (yet)


type E = [1,2,3] extends [1,...unknown[]] ? 1 : 0;
type __ = E;


export type Ctx<NT,PL extends string[],O> =
  PL extends ['M',...unknown[]] ? (
    {}
  ) :
  PL extends ['C',...unknown[]] ? (
    Extend<
      MachineSpaceCtx,
      PathCtx<NT,PL,O>
    >
  ) :
  {}
;


export type PathCtx<NT,PL extends string[],O> = 
  RelPaths.Form<NT,PL> extends infer RT ?
  {
    and: PhaseHelper.Form<RT,O>,
    ref: RefHelper.Form<RT>,
    expandType: <T>(t:T)=>PreExpand<T,typeof $self,O>
  }
  : never
;

export type MachineCtx<NT,PL extends string[],O> =
  Extend<
    Extend<
      MachineSpaceCtx,
      {
        id: Id
        isFresh: () => boolean
      }
    >,
    PathCtx<NT,PL,O>
  >;

export type ClientCtx<NT,O> =
  Extend<
    MachineSpaceCtx,
    PathCtx<NT,[],O>
  >;

export type Extend<A, B> = Omit<A, keyof B> & B;

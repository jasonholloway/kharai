import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import { Id, DataMap, RawDataMap } from '../src/lib'
import { BehaviorSubject } from 'rxjs'
import { shareReplay, scan, groupBy, map, mergeMap, toArray } from 'rxjs/operators'
import { AtomRef, Atom, AtomLike } from '../src/atoms'
import { newRun, RunOpts } from '../src/Run'
import { tracePath, renderAtoms } from '../src/AtomPath'
import FakeStore from '../src/FakeStore'
import { BuiltWorld } from '../src/shape/BuiltWorld'
import { Ctx } from '../src/shape/Ctx'
import * as NodeTree from '../src/shape/NodeTree'
import { delay } from './helpers'

type Opts = { maxBatchSize?: number, data?: RawDataMap } & RunOpts;

class AndNext { sym = Symbol('unique') };

export type TestRun<N,V=unknown> = {
  perform<PV>(...fns: ((x: Ctx<NodeTree.Form<N>,['C'],AndNext>)=>(PV|PromiseLike<PV>))[]): TestRun<N,PV>
  waitQuiet(runMs?: number,saveMs?:number): Promise<Remnant<V>>
};

export type Remnant<V> = {
  result: V
  saved: RawDataMap
  batches: RawDataMap[]
  logs: (readonly [Id,[string,unknown]])[]
  view(id:Id): { atoms: AtomView<DataMap>[], logs: [Id,unknown][] }
};

export function run<N>(world: BuiltWorld<N,unknown>, opts?: Opts): TestRun<N> {
  
  const store = new FakeStore(opts?.maxBatchSize || 4, opts?.data);

  const run = newRun<N,AndNext>(world, store, store, { ...opts });

  const atomSub = new BehaviorSubject<Map<string, AtomRef<DataMap>[]>>(Map()); 

  run.machine$.pipe(
    groupBy(m => m.id),
    mergeMap(m$ => m$.pipe(
      mergeMap(m => m.log$),
      map(({atom}) => atom),
      scan<AtomRef<DataMap>, [string, AtomRef<DataMap>[]]>(([k, rs], r) => [k, [...rs, r]], [m$.key, []])
    )),
    scan((ac: Map<string, AtomRef<DataMap>[]>, [k, rs]) => {
      return ac.set(k, rs);
    }, Map<string, AtomRef<DataMap>[]>()),
    shareReplay(1),
  ).subscribe(atomSub);

  const log$ = run.log$.pipe(
    // tap(l => console.debug('LOG', inspect(l, {depth:2}))),
    map(([id,{data}]) => [id,data] as const),
    shareReplay(1000)
  );

  log$.subscribe();

  function _add<V>(prev: Promise<V>) {
    return {
      perform<R>(...fns: ((x:Ctx<NodeTree.Form<N>,['C'],AndNext>)=>Promise<R>)[]) {
        return _add(prev.then(async () => {
          const results = await Promise.all(fns.map(fn => run.machineSpace.runArbitrary(fn)));
          return results;
        }));
      },

      async waitQuiet(runMs:number = 100, saveMs:number = 100): Promise<Remnant<V>> {
        //wait till quiet here...
        
        const result = await prev;

        await delay(runMs);

        run.complete();
        
        const logs = await log$.pipe(toArray()).toPromise();

        //horrible little hack below
        await delay(saveMs);
        
        return {
          result,
          saved: store.saved,
          batches: store.batches,
          logs,

          view(id:Id) {
            return {
              atoms: viewAtoms(List(atomSub.getValue()?.get(id) || [])),
              logs: logs
                .filter(([lid,d]) => lid == id && !!d)
                .map(([,d]) => <[string,unknown]>d)
            }
          }
        };
      }
    }
  };

  return _add(Promise.resolve(<unknown>{}));
}

export function resolveAtoms<V>(rs:AtomLike<V>[]|List<AtomLike<V>>|Set<AtomLike<V>>) {
  return List(rs)
    .flatMap(r => {
      switch(r?._type) {
        case 'Atom':
          return List<Atom<V>>([r]);

        case 'AtomRef':
          return List<Atom<V>>(r.resolve());

        default:
          return List<Atom<V>>();
      }
    })
    .toArray();
}

export function viewAtoms<V>(rs:AtomLike<V>[]|List<AtomLike<V>>|Set<AtomLike<V>>) {
  return List(resolveAtoms(rs))
    .toOrderedSet()
    .map(a => new AtomView<V>(a))
    .toArray();
}

class AtomView<V> {
  private _atom: Atom<V>

  constructor(atom: Atom<V>) {
    this._atom = atom;
  }

  unpack() {
    return this._atom;
  }

  val() {
    return this._atom.val;
  }

  parents() {
    return viewAtoms(this._atom.parents);
  }

  trace() {
    return tracePath(List([this._atom]))
  }

  print() {
    return renderAtoms(List([this._atom]))
  }
}


export function showData(av: AtomView<DataMap>) {
	return av.val().map(p => p.data).toObject();
}

export function assertSubtype<A,B extends A>(a?:A, b?:B) {}

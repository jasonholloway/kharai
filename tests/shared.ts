import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import { Id, DataMap, RawDataMap } from '../src/lib'
import { BehaviorSubject } from 'rxjs'
import { shareReplay, scan, groupBy, map, filter, takeWhile, mergeMap } from 'rxjs/operators'
import { AtomRef, Atom, AtomLike } from '../src/atoms'
import { gather } from './helpers'
import { newRun, RunOpts } from '../src/Run'
import { tracePath, renderAtoms } from '../src/AtomPath'
import FakeStore from '../src/FakeStore'
import { BuiltWorld } from '../src/shape/BuiltWorld'
import { Ctx } from '../src/shape/Ctx'
import * as NodeTree from '../src/shape/NodeTree'
import CancellablePromise from './CancellablePromise'

type Opts = { maxBatchSize?: number, data?: RawDataMap } & RunOpts;

class AndNext { sym = Symbol('unique') };

export type TestRun<N,V=unknown> = {
  perform<PV>(fn: (x: Ctx<NodeTree.Form<N>,['C'],AndNext>)=>Promise<PV>): TestRun<N,PV>
  waitQuiet(): Promise<Remnant<V>>
};

export type Remnant<V> = {
  result: V
  saved: RawDataMap
  batches: RawDataMap[]
  logs: [Id,unknown][]
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

  return {
    perform(fn) {


      run.machineSpace.runArbitrary(fn)
      
      return new CancellablePromise(() => {
      });

      
      const result = await fn()
      throw 123;
    },

    waitQuiet() {
      throw 123;
    }
  };



  return {
    logs: (...ids: Id[]) => {
      const idSet = Set(ids);
      return gather(log$.pipe(
        filter(([i]) => idSet.contains(i)),
        map(([,p]) => p),
        takeWhile((p): p is [string, unknown] => !!p),
      ));
    },

    gatherLogs: () => gather(log$),

    view(id: Id) {
      return viewAtoms(List(atomSub.getValue()?.get(id) || []));
    },

    async session(fn: ()=>Promise<void>) {
      const release = run.keepAlive();
      try {
        await fn();
      }
      finally {
        release();
        run.complete();
      }
    }
  }
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

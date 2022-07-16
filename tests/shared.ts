import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import { Id, Data } from '../src/lib'
import { BehaviorSubject } from 'rxjs'
import { shareReplay, scan, groupBy, map, filter,takeWhile, mergeMap } from 'rxjs/operators'
import { AtomRef, Atom, AtomLike } from '../src/atoms'
import { gather } from './helpers'
import { Loader, Log } from '../src/MachineSpace'
import MonoidData from '../src/MonoidData'
import { newRun } from '../src/Run'
import { tracePath, renderAtoms } from '../src/AtomPath'
import FakeStore from '../src/FakeStore'
import { BuiltWorld } from './shape/BuiltWorld'

const MD = new MonoidData();

type Opts = { batchSize?: number, threshold?: number, save?: boolean, loader?: Loader };

export function createRunner<N>(world: BuiltWorld<N>, opts?: Opts) {
  const save = opts?.save === undefined || opts?.save;

  const store = new FakeStore(MD, opts?.batchSize || 4);

  //loader here seems bit daft: should have an injectable store
  const loader: Loader =
    opts?.loader ??
    (ids => Promise.resolve(
      ids.reduce((ac, id) => ac.set(id, ['$boot', []]), Map()))
    );

  const run = newRun(world, loader, { ...opts, store: (save ? store : undefined) });

  const atomSub = new BehaviorSubject<Map<string, AtomRef<Data>[]>>(Map()); 

  run.machine$.pipe(
    groupBy(m => m.id),
    mergeMap(m$ => m$.pipe(
      mergeMap(m => m.log$),
      mergeMap(([,r]) => r ? [r] : []),
      scan<AtomRef<Data>, [string, AtomRef<Data>[]]>(([k, rs], r) => [k, [...rs, r]], [m$.key, []])
    )),
    scan((ac: Map<string, AtomRef<Data>[]>, [k, rs]) => {
      return ac.set(k, rs);
    }, Map<string, AtomRef<Data>[]>()),
    shareReplay(1),
  ).subscribe(atomSub);

  const log$ = run.log$.pipe(
    map(([id, p]) => [id, p] as const),
    shareReplay(1000)
  );

  log$.subscribe();

  return {
    store,
    run,

    logs: (id: Id) =>
      gather(log$.pipe(
        filter(([i]) => i == id),
        map(([,[p]]) => p),
        takeWhile((p): p is [string, unknown] => !!p),
      )),

    allLogs: () => gather(log$),

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




// export function scenario<
//   W extends PhaseMap,
//   P = Phase<W>,
//   X extends MachineContext<P> = MachineContext<P>>
//   (world: WorldImpl<W, X> & ContextImpl<P, X>)
// {
//   return (opts?: { phases?: Map<Id, P>, batchSize?: number, threshold?: number, save?: boolean, loader?: Loader<P> }) => {

//     const save = opts?.save === undefined || opts?.save;
    
//     const store = new FakeStore(MD, opts?.batchSize || 4);

//     const loader: Loader<P> =
//       opts?.loader ??
//       (ids => Promise.resolve(
//         ids
//           .reduce<Map<Id, P>>((ac, id) => {
//             const found = opts?.phases?.get(id);
//             const p = found || <P><unknown>(['$boot', []]);
//             return ac.set(id, p);
//           }, Map())));

//     const run = newRun(world, loader, { ...opts, store: (save ? store : undefined) });

//     const atomSub = new BehaviorSubject<Map<string, AtomRef<Data>[]>>(Map()); 

//     run.machine$.pipe(
//       groupBy(m => m.id),
//       mergeMap(m$ => m$.pipe(
//         mergeMap(m => m.log$),
//         mergeMap(([,r]) => r ? [r] : []),
//         scan<AtomRef<Data>, [string, AtomRef<Data>[]]>(([k, rs], r) => [k, [...rs, r]], [m$.key, []])
//       )),
//       scan((ac: Map<string, AtomRef<Data>[]>, [k, rs]) => {
//         return ac.set(k, rs);
//       }, Map<string, AtomRef<Data>[]>()),
//       shareReplay(1),
//     ).subscribe(atomSub);

//     const log$ = run.log$.pipe(
//       map(([id, p]) => [id, p] as const),
//       shareReplay(1000)
//     );

//     log$.subscribe();

//     return {
//       store,
//       run,

//       logs: (id: Id) =>
//         gather(log$.pipe(
//           filter(([i]) => i == id),
//           map(([,p]) => p),
//           takeWhile((p): p is P => !!p),
//         )),

//       allLogs: () => gather(log$),

//       view(id: Id) {
//         return viewAtoms(List(atomSub.getValue()?.get(id) || []));
//       },

//       async session(fn: ()=>Promise<void>) {
//         const release = run.keepAlive();
//         try {
//           await fn();
//         }
//         finally {
//           release();
//           run.complete();
//         }
//       }
//     }
//   }
// }


// export function phasesOnly(): OperatorFunction<Emit<any>, readonly [Id, any]> {
//   return mergeMap(l => {
//     if(isString(l[0]) || (isArray(l[0]) && isString(l[0][0]) && isString(l[0][1]))) {
//       return [<[Id, any]>l];
//     }
//     else {
//       return [];
//     }
//   })
// }

// export function commitsOnly(): OperatorFunction<Emit<any>, AtomEmit<Data>> {
//   return mergeMap(l => {
//     if(l[0] == $Commit) {
//       return [<[typeof $Commit, AtomRef<Data>]>l];
//     }
//     else {
//       return [];
//     }
//   })
// }

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

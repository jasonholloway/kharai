import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import { Id, Data, MachineContext, Phase, PhaseMap, WorldImpl } from '../src/lib'
import { OperatorFunction, concat, of, combineLatest, BehaviorSubject } from 'rxjs'
import { flatMap, filter, map, first, concatMap, takeWhile, expand, shareReplay, scan, groupBy } from 'rxjs/operators'
import { AtomRef, Atom, AtomLike } from '../src/atoms'
import { isString, isArray } from 'util'
import { AtomEmit, $Commit } from '../src/Committer'
import { gather } from './helpers'
import { Emit } from '../src/MachineSpace'
import AtomSaver from '../src/AtomSaver'
import MonoidData from '../src/MonoidData'
import { Run, LoaderFac } from '../src/Run'
import FakeStore from './FakeStore'
import { tracePath, renderAtoms } from '../src/AtomPath'

export function scenario<W extends PhaseMap, X extends MachineContext, P = Phase<W>>(world: WorldImpl<W, X>) {
  return (opts?: { phases?: Map<Id, P>, batchSize?: number, threshold?: number, runSaver?: boolean }) => {

    const M = new MonoidData();

    const store = new FakeStore(M, opts?.batchSize || 4);

    const loaderFac: LoaderFac<P> =
      atoms => async id => {
        const found = opts?.phases?.get(id);
        const p = found || <P><unknown>(['$boot', []]);

        const h = atoms.head();

        if(found) {
          h.write(Map({
            [isArray(id) ? id[0] : id]: p
          }));
        }

        return [h, p];
      };

    const run = new Run<W, X, P>(world, loaderFac);

    const atomSub = new BehaviorSubject<Map<string, AtomRef<Data>[]>>(Map()); 
    run.machine$.pipe(
      groupBy(m => m.id),
      flatMap(m$ => m$.pipe(
        flatMap(m => m.head.atom$),
        scan<AtomRef<Data>, [string, AtomRef<Data>[]]>(([k, rs], r) => [k, [...rs, r]], [m$.key, []])
      )),
      scan((ac: Map<string, AtomRef<Data>[]>, [k, rs]) => {
        return ac.set(k, rs);
      }, Map<string, AtomRef<Data>[]>()),
      shareReplay(1),
    ).subscribe(atomSub);

    const saver = new AtomSaver(M, run.atoms);

		const threshold$ = concat(
			of(opts?.threshold || 3),
			run.signal$.pipe(
				filter(s => s.stop),
				map(() => 0),
				first()
			));

    if(!(opts?.runSaver === false)) {
      combineLatest(
        run.atoms.state$,
        threshold$
      ).pipe(
        concatMap(([s,t]) =>
          of(s.weights.pending()).pipe(
            takeWhile(p => p > t),
            expand(async p => {
              const w = await saver.save(store, s.heads);
              return p - w;
            }),
            takeWhile(p => p > t)
          ))
      ).subscribe()
    }

    return {
      store,
      saver,
      run,

      logs() {
        return gather(run.log$
          .pipe(phasesOnly()))
      },

      view(id: Id) {
        return viewAtoms(List(atomSub.getValue()?.get(id) || []));
      }
    }
  }
}


export function phasesOnly(): OperatorFunction<Emit<any>, readonly [Id, any]> {
  return flatMap(l => {
    if(isString(l[0]) || (isArray(l[0]) && isString(l[0][0]) && isString(l[0][1]))) {
      return [<[Id, any]>l];
    }
    else {
      return [];
    }
  })
}

export function commitsOnly(): OperatorFunction<Emit<any>, AtomEmit<Data>> {
  return flatMap(l => {
    if(l[0] == $Commit) {
      return [<[typeof $Commit, AtomRef<Data>]>l];
    }
    else {
      return [];
    }
  })
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

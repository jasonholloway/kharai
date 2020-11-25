import { Map, Set, Seq, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import AtomSpace from '../src/AtomSpace'
import { Id, Data, World, MachineContext, Phase, PhaseMap, WorldImpl, PhaseImpl } from '../src/lib'
import { OperatorFunction, concat, of, combineLatest } from 'rxjs'
import { flatMap, mergeMap, filter, tap, map, first, concatMap, takeWhile, expand } from 'rxjs/operators'
import { delay } from '../src/util'
import { AtomRef } from '../src/atoms'
import { isString, isArray } from 'util'
import { AtomEmit, $Commit } from '../src/Committer'
import { gather } from './helpers'
import { Emit, MachineLoader } from '../src/MachineSpace'
import AtomSaver from '../src/AtomSaver'
import MonoidData from '../src/MonoidData'
import { Run, LoaderFac } from '../src/Run'
import FakeStore from './FakeStore'

export const bootPhase = <W extends World>(): PhaseImpl<W, MachineContext, []> =>
  (x => ({
    guard(d: any): d is [] { return true },
    async run() {
      while(true) {
        const answer = await x.attach<Phase<W>>({
          chat(c) { return c; } //should be checking this here...
        });

        if(answer) {
          return answer[0];
        }
        else {
          await delay(30); //when we release properly, this can be removed
        }
      }
    }
  }));

export const endPhase = <W extends World>(): PhaseImpl<W, MachineContext, [any]> =>
  (x => ({
    guard(d: any): d is [any] { return true },
    async run() { return false as const; }
  }));

export const waitPhase = <W extends World>(): PhaseImpl<W, MachineContext, [number, Phase<W>]> =>
  (x => ({
    guard(d: any): d is [number, Phase<W>] { return true },
    async run([delay, next]) {
      return next;
    }
  }));

export const watchPhase = <W extends World>(): PhaseImpl<W, MachineContext, [Id, string, Phase<W>]> =>
  (x => ({
    guard(d: any): d is [Id, string, Phase<W>] { return true },
    async run([id, pred, next]) {
      return next;
    }
  }));


export function scenario<W extends PhaseMap, X extends MachineContext, P = Phase<W>>(world: WorldImpl<W, X>) {
  return (opts?: { phases?: Map<Id, P>, batchSize?: number, threshold?: number }) => {

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

    const saver = new AtomSaver(M, run.atoms);

		const threshold$ = concat(
			of(opts?.threshold || 3),
			run.signal$.pipe(
				filter(s => s.stop),
				map(() => 0),
				first()
			));

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

    return {
      store,
      saver,
      run,

      logs() {
        return gather(run.log$
          .pipe(phasesOnly()))
      },

      atoms(id: Id) {
        return gather(
          run.machine$.pipe(
            filter(m => m.id == id),
            flatMap(m => m.head.atom$),
            flatMap(r => r.resolve())
          )
        )
      }
    }
  }
}

export const getAtoms = (rs: List<AtomRef<Data>>) => rs.flatMap(r => r.resolve()).toArray()

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

import { Map, Set } from 'immutable'
import _Monoid from '../src/_Monoid'
import AtomSpace from '../src/AtomSpace'
import { Id, Data, World, MachineContext, Phase, PhaseMap, WorldImpl, PhaseImpl } from '../src/lib'
import { OperatorFunction } from 'rxjs'
import { flatMap, mergeMap } from 'rxjs/operators'
import { buildDispatch } from '../src/dispatch'
import { delay } from '../src/util'
import { AtomRef } from '../src/atoms'
import { isString, isArray } from 'util'
import { AtomEmit, $Commit } from '../src/Committer'
import { gather } from './helpers'
import { Emit, MachineLoader, MachineSpace } from '../src/MachineSpace'

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


export function scenario<W extends PhaseMap, X>(world: WorldImpl<W, X>) {
  return (phases?: Map<Id, Phase<W>>) => {
    const atomSpace = new AtomSpace<Data>();

    const loader: MachineLoader<Phase<W>> = async id => {
      const p = phases?.get(id) || <Phase<W>><unknown>(['$boot', []]); //zero phase should be well-known

      const h = atomSpace.head()
        .write(Map({
          [isArray(id) ? id[0] : id]: p
        }));

      return [h, p];
    };

    const dispatch = buildDispatch(world.phases);
    const space = new MachineSpace(world, loader, dispatch);
    const run = space.newRun();

    return {
      loader,
      dispatch,
      space,
      run,

      logs() {
        return gather(run.log$
          .pipe(phasesOnly()))
      },

      atoms(id: Id) {
        return gather(space
          .summon(Set([id]))
          .pipe(
            mergeMap(m => m.atom$),
            mergeMap(r => r.resolve())
          ));
      }
    }
  }
}

export const getAtoms = (rs: Set<AtomRef<Data>>) => rs.flatMap(r => r.resolve()).toArray()

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

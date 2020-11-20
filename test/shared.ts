import { Map, Set } from 'immutable'
import _Monoid from '../src/_Monoid'
import AtomSpace from '../src/AtomSpace'
import { Id, Data, World, MachineContext, Phase, PhaseMap, WorldImpl, PhaseImpl } from '../src/lib'
import { OperatorFunction } from 'rxjs'
import { flatMap, mergeMap, filter } from 'rxjs/operators'
import { delay } from '../src/util'
import { AtomRef } from '../src/atoms'
import { isString, isArray } from 'util'
import { AtomEmit, $Commit } from '../src/Committer'
import { gather } from './helpers'
import { Emit, MachineLoader } from '../src/MachineSpace'
import AtomSaver from '../src/AtomSaver'
import MonoidData from '../src/MonoidData'
import { Run } from '../src/Run'

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
  return (phases?: Map<Id, P>) => {
    const atomSpace = new AtomSpace<Data>();

    const loader: MachineLoader<P> = async id => {
      const found = phases?.get(id);
      const p = found || <P><unknown>(['$boot', []]);

      const h = atomSpace.head()
        .write(Map({
          [isArray(id) ? id[0] : id]: p
        }), found ? 1 : 0);

      return [h, p];
    };

    const saver = new AtomSaver(new MonoidData(), atomSpace);

    const run = new Run<W, X, P>(world, loader);

    return {
      loader,
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
            mergeMap(m => m.head$),
            mergeMap(h => h.refs()),
            mergeMap(r => r.resolve())
          )
        )
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

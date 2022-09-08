import { Lock, Locks } from './Locks'
import { Set } from 'immutable'
import { Atom, AtomRef } from './atoms'
import AtomPath from './AtomPath'
import { Observable, of, combineLatest, EMPTY } from 'rxjs';
import _Monoid from './_Monoid';
import { filter, shareReplay, map, expand, mergeScan, takeUntil, share, concatMap } from 'rxjs/operators';
import { Signal } from './MachineSpace';
import AtomSaver from './AtomSaver';
import { Saver } from './Store';

const MonoidLump = <V>() => <_Monoid<Lump<V>>> {
  zero: [0, Set()],
  add: ([aW, aS], [bW, bS]) => [aW + bW, aS.union(bS)]
}

export type Weight = number;
export type Threshold = number
export type Commit<V> = [Weight, AtomRef<V>]

export type Lump<V> = [Weight, Set<AtomRef<V>>]
export type Storer<V> = (s: Saver<V>) => Promise<any>

export const runSaver = <V>(signal$: Observable<Signal>, threshold$: Observable<Threshold>, MV: _Monoid<V>) =>
  (commit$: Observable<Commit<V>>) => {

    const kill$ = signal$.pipe(
      filter(s => s.stop), shareReplay(1));

    const space = new AtomSpace<V>();
    const saver = new AtomSaver<V>(MV, space);
    const ML = MonoidLump<V>();

    const lump$ = commit$.pipe(
      map(([w, r]) => <Lump<V>>[w, Set([r])])
    );

    type Tup = [Lump<V>, Threshold, Storer<V>?]

    return combineLatest([lump$, threshold$]).pipe(
      mergeScan(([ac]: Tup, [l, t]) =>
        of<Tup>([ML.add(ac,l), t]).pipe(

          expand(([[w, rs], t]) => {
            console.debug('SAVE?', `${w}/${t}`);

            //the rejection of saving 
            //


            return (!w || (w < t))
              ? EMPTY
              : new Observable<Tup>(sub => {
                  return sub.next([
                    ML.zero, 0,
                    async store => {
                      try {
                        console.debug('SAVE!');
                        const [w2, rs2] = await saver.save(store, rs.toList())
                        sub.next([[w - w2, rs.subtract(rs2)], t]);
                        sub.complete();
                      }
                      catch(e) {
                        sub.error(e);
                      }
                    }])
              })
          }),
        ),
        [ML.zero, 0], 1),
      concatMap(([,,fn]) => fn ? [fn] : []),
      share(),
      takeUntil(kill$)
    );
  };
  

export default class AtomSpace<V> {
  private _locks: Locks

  constructor() {
    this._locks = new Locks();
  }

  async lockPath(...tips: AtomRef<V>[]): Promise<AtomPath<V>> {
    const _tips = Set(tips);
    let roots1 = _tips.flatMap(AtomPath.findRoots);

    //repeatedly lock until stable
    while(true) {
      const lock = await this.lock(roots1);
      const roots2 = _tips.flatMap(AtomPath.findRoots);

      if(roots2.equals(roots1)) {
        return new AtomPath([..._tips], lock);
      }
      else {
        roots1 = roots2;
        lock.release();
      }
    }
  }

  private lock<V>(atoms: Set<Atom<V>>): Promise<Lock> {
    return this._locks.lock(...atoms).promise();
  }
}

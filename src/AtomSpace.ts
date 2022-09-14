import { Lock, Locks } from './Locks'
import { Set } from 'immutable'
import { Atom, AtomRef } from './atoms'
import AtomPath from './AtomPath'
import { Observable, of, combineLatest, EMPTY } from 'rxjs';
import _Monoid from './_Monoid';
import { expand, mergeScan, share, concatMap } from 'rxjs/operators';
import AtomSaver from './AtomSaver';
import { Saver } from './Store';

export type Weight = number;
export type Threshold = number

export type Lump<V> = [Weight, Set<AtomRef<V>>]
export type Storer<V> = (s: Saver<V>) => Promise<any>

export const MonoidLump = <V>() => <_Monoid<Lump<V>>> {
  zero: [0, Set()],
  add: ([aW, aS], [bW, bS]) => [aW + bW, aS.union(bS)]
}


export const runSaver = <V>(MV: _Monoid<V>, lump$: Observable<Lump<V>>, threshold$: Observable<Threshold>) => {
  const space = new AtomSpace<V>();
  const saver = new AtomSaver<V>(MV, space);
  const ML = MonoidLump<V>();

  type Tup = [Lump<V>, Threshold, Storer<V>?]

  return combineLatest([lump$, threshold$]).pipe(
    mergeScan(([ac]: Tup, [l, t]) =>
      of<Tup>([ML.add(ac,l), t]).pipe(

        expand(([[w, rs], t]) => {

          console.debug('SAVE?', `${w}/${t}`);
          return (!w || (w < t))
            ? EMPTY
            : new Observable<Tup>(sub => {
                return sub.next([
                  ML.zero, 0,
                  async store => {
                    try {
                      const [w2, rs2] = await saver.save(store, rs);
                      console.debug('SAVED', w2);
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
    share()
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

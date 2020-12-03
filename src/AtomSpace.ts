import { Lock, Locks } from './Locks'
import { Set } from 'immutable'
import { Atom, AtomRef } from './atoms'
import AtomPath from './AtomPath'
import { Observable, of, combineLatest, EMPTY } from 'rxjs';
import _Monoid from './_Monoid';
import { filter, shareReplay, map, expand, mergeScan, takeUntil, share, concatMap, tap, finalize } from 'rxjs/operators';
import { Signal } from './MachineSpace';
import AtomSaver from './AtomSaver';
import Store from './Store';

const log = console.log;

export type Weight = number;
export type Threshold = number
export type Commit<V> = [Weight, AtomRef<V>]

// type Weights = { created: number, staged: number, saved: number, pending(): number }
// type State<V> = { heads: List<Head<V>>, weights: Weights }
// type Change<V> = (s: State<V>) => State<V>

// type Saver<V> = (refs: Set<AtomRef<V>>) => Observable<Save>
// type Save = { weight: number }

export type Lump<V> = [Weight, Set<AtomRef<V>>]
export type Storer<V> = (s: Store<V>) => Promise<any>

export const runSaver = <V>(signal$: Observable<Signal>, threshold$: Observable<Threshold>, mv: _Monoid<V>) =>
  (commit$: Observable<Commit<V>>) => {

    const kill$ = signal$.pipe(
      filter(s => s.stop), shareReplay(1));

    const space = new AtomSpace<V>();
    const saver = new AtomSaver<V>(mv, space);

    type L = Lump<V>
    const ML = <_Monoid<L>> {
      zero: [0, Set()],
      add: ([aW, aS], [bW, bS]) => [aW + bW, aS.union(bS)]
    }


    const lump$ = commit$.pipe(
      map(([w, r]) => <L>[w, Set([r])])
    );

    //TODO
    //stream saves out
    //the actual save action should be done below
    //
    //would be nice if, each time threshold was met,
    //a function were streamed out, pushing down application of store
    //this function would then complete the observable that carries it
    //

    type Tup = [L, Threshold, Storer<V>?]

    return lump$.pipe(
      mergeScan(([ac]: Tup, l) =>
        combineLatest(of(ML.add(ac, l)), threshold$)
        .pipe(
          tap(x => log('in', x)),
          expand(([[w, rs], t]) =>
            (w < t)
              ? EMPTY
            : new Observable<Tup>(sub => {

                  log('subbed')
              
                  return sub.next([
                    [w, rs], t,
                    async store => {
                      try {
                        const [w2, rs2] = await saver.save(store, rs)
                        sub.next([[w - w2, rs.subtract(rs2)], t]);
                        sub.complete();
                      }
                      catch(e) {
                        sub.error(e);
                      }
                    }])
                })
            ),
          finalize(() => log('FIN.')),
        ),
        [ML.zero, 0], 1),
      tap(x => log('out', x)),
      concatMap(([,,fn]) => fn ? [fn] : []),
      share(),
      takeUntil(kill$)
    );
  };
  

export default class AtomSpace<V> {
  private _locks: Locks
  // private _weights: Weights
  // private _change$: Subject<Change<V>>
  // private _atom$: Subject<AtomRef<V>>

  // readonly state$: Observable<State<V>>
  // readonly atom$: Observable<AtomRef<V>>

  constructor() {
    this._locks = new Locks();
    // this._weights = { created: 0, staged: 0, saved: 0, pending() { return this.created - this.staged } };

    // this._atom$ = new Subject();
    // this.atom$ = this._atom$;

    // this._change$ = new Subject();
    // this.state$ = this._change$.pipe(
    //   scan<Change<V>, State<V>>(
    //     (ac, c) => c(ac),
    //     {
    //       heads: List(),
    //       weights: { created: 0, staged: 0, saved: 0, pending() { return this.created - this.staged } }
    //     }),
    //   shareReplay(1)
    // );

    // signal$.pipe(
    //   filter(s => s.stop),
    //   first(),
    //   tap(() => {
    //     this._atom$.complete();
    //     this._change$.complete();
    //   })
    // ).subscribe();
  }

  // incStaged(weight: number) {
  //   this._weights.staged += weight;
  //   this._change$.next(s => ({
  //     ...s,
  //     weights: {
  //       ...s.weights,
  //       staged: s.weights.staged + weight
  //     }
  //   }));
  // }

  // incSaved(weight: number) {
  //   this._weights.saved += weight;
  //   this._change$.next(s => ({
  //     ...s,
  //     weights: {
  //       ...s.weights,
  //       saved: s.weights.saved + weight
  //     }
  //   }));
  // }

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
    return this._locks.lock(...atoms);
  }

  // weights() {
  //   const w = this._weights;
  //   return {
  //     ...w,
  //     pending: w.created - (w.staged + w.saved)
  //   };
  // }
}

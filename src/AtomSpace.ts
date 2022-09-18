import { Lock, Locks } from './Locks'
import { Set, Map } from 'immutable'
import { Atom, AtomRef } from './atoms'
import AtomPath from './AtomPath'
import { Observable, merge, of, combineLatest, EMPTY } from 'rxjs';
import _Monoid from './_Monoid';
import { shareReplay, map, scan, expand, mergeScan, share, concatMap } from 'rxjs/operators';
import AtomSaver from './AtomSaver';
import { Saver } from './Store';
import { inspect } from 'node:util';

export type Weight = number;
export type Threshold = number

export type Lump<V> = [Weight, Set<AtomRef<V>>]
export type Storer<V> = (s: Saver<V>) => Promise<any>

export const MonoidLump = <V>() => <_Monoid<Lump<V>>> {
  zero: [0, Set()],
  add: ([aW, aS], [bW, bS]) => [aW + bW, aS.union(bS)]
}

//NB:
//some kind of debouncing of lumps upstream would be useful
//but that's exactly what this is here: though hereit's debouncing dependent
//on external actions, which makes it very slow
//the cost of accumulation here is apt to explode
//the only solution would be pre-emptive debouncing
//and for this we need to know the battch size so we can consolidate up to it

export const runSaver = <V>(MV: _Monoid<V>, lump$: Observable<Lump<V>>, threshold$: Observable<Threshold>) => {
  const space = new AtomSpace<V>();
  const saver = new AtomSaver<V>(MV, space);
  const ML = MonoidLump<V>();

  type Thresh = number;
  type Inp = ['L',Lump<V>] | ['T',Thresh];

  type Ac = [Lump<V>, Thresh];
  type Outp = [Ac, Storer<V>?];

  const inputs = merge(
    threshold$.pipe(map(t => <Inp>['T', t])),
    lump$.pipe(map(l => <Inp>['L', l]))
  );

  return inputs.pipe(
    scan<Inp, Observable<Outp>>(
      (prev, inp) => prev.pipe(
        map(([[l0, t0]]) => {
          switch(inp[0]) {
            case 'L':
              const l1 = inp[1];
              const l2 = ML.add(l0,l1);
              return <Ac>[l2, t0];

            case 'T':
              const t1 = inp[1];
              return <Ac>[l0, t1];
          }
        }),
        concatMap(ac => {
          const [[w,rs],t] = ac;

          console.debug(
            'SAVE?', `${w}/${t}`,
            inspect(rs
              .flatMap(r => r.resolve())
              .reduce((ac, {val}) => ({ ...ac, ...(<Map<string,{data:unknown}>><unknown>val).map(p => p.data).toObject() }), {}),
              {depth:2})
          );
          
          if(t < 0 || w <= 0 || w < t) {
            return of(<Outp>[ac]);
          }

          return new Observable<Outp>(sub => {
            sub.next(<Outp>[
              ac,
              async store => {
                try {
                  const [w2, rs2] = await saver.save(store, rs);
                  console.debug('SAVED', w2);

                  sub.next(<Outp>[
                    <Ac>[<Lump<V>>[w - w2, rs.subtract(rs2)], t]
                  ]);

                  sub.complete();
                }
                catch(e) {
                  sub.error(e);
                }
              }
            ]);
          })
        }),
        shareReplay(1)
      ),
      of([[ML.zero, -1]])
    ),
    concatMap(o => o.pipe(concatMap(([,fn]) => fn ? [fn] : []))),
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

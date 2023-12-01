import { Set, OrderedMap } from 'immutable'
import CancellablePromise, { CancelledError } from './CancellablePromise';
import { Preemptable } from './Preemptable';

type Token = object
type Waiter = () => ((()=>void) | false);
type DoTheInc = () => void;

export class Locks {
  private readonly _inner = new Allocator(false);

  private static readonly claim: Claim<boolean> = {
    canApp: x => !x,
    app: _ => true,
    reverse: () => ({
      canApp: x => x,
      app: _ => false
    })
  };
  
  lock(...items: object[]) {
    return this._inner.app(items, [Locks.claim]);
  }

  canLock(item: object) {
    return this._inner.canApp(item, Locks.claim);
  }
}


interface ClaimHandle<X> extends Lock {
  offers(): Set<X>
}

export class Exchange<X> {
  private readonly _inner: Allocator<[X?, boolean?]>

  constructor() {
    this._inner = new Allocator<[X?, boolean?]>([]);
  }
  
  claim(...items: object[]): Preemptable<ClaimHandle<X>> {
    let offers = Set<X>();
    
    return this._inner.app(items,
      _ => ({
        canApp: ([x, b]) => (!!x && !b),
        app: ([x]) => {
          offers = offers.add(<X>x);
          return [x, true];
        },
        reverse: () => ({
          canApp: ([x, b]) => (!!x && !!b),
          app: ([x]) => {
            offers = offers.remove(<X>x);
            return [x];
          },
          vip: true
        })
      }))
      .map(h => ({
        ...h,
        offers: () => offers
      }));
  }

  offer(items: object[], x: ((r:Releasable)=>X)|[X]): Preemptable<Lock> {
    return this._inner.app(items,
      r => ({
        canApp: ([x]) => !x,
        app: _ => [typeof x === 'function' ? x(r) : x[0]],
        reverse: () => ({
          canApp: ([x, b]) => (!!x && !b),
          app: _ => [],
          vip: true
        })
      }));
  }
}

export class Semaphores {
  private readonly _inner = new Allocator(0);

  private static readonly claim = (c: number): Claim<number> => ({
    canApp: x => (x + c >= 0),
    app: x => x + c,
    reverse: () => ({
      canApp: x => (x - c >= 0),
      app: x => x - c
    })
  });

  inc(items: object[], c: number) {
    return this._inner.app(items, () => Semaphores.claim(c));
  }

  canInc(items: object[], c: number) {
    return this._inner.canApp(items, Semaphores.claim(c));
  }
}


export interface Releasable {
  release(): Promise<void>
}

export interface Lock extends Releasable {
  extend(extras: Set<object>): void
}

class Allocator<X> {
  private readonly _default: X
  private readonly _entries: WeakMap<object, Entry<X>>

  constructor(def: X) {
    this._default = def;
    this._entries = new WeakMap<object, Entry<X>>();
  }

  app(_items: object[], cArg: ((r:Releasable)=>Claim<X>)|[Claim<X>]): Preemptable<Lock> {
    const _this = this;
    const items = Set(_items);
    const token = new Object();
    let _lock: Lock;

    if(tryIncAllNow(items)) {
      return Preemptable.lift(onSuccess(items));
    }
    else {
      return Preemptable.lift(
        CancellablePromise.create((resolve, reject, onCancel)=> {
          const answers = items.map(i => [i, tryIncOne(i)] as const);
          answers.forEach(([i, ans]) => {
            if(ans[0] == 'mustWait') ans[1](adoptOneIncAll(i, items, resolve));
          });

          onCancel(async () => {
            if(_lock) {
              console.info('UNTESTED PATH')
              await _lock.release();
              //todo does the above release the locking promise?
            }
            else {
              items
                .map(i => _this.summonEntry(i))
                .forEach(entry => {
                  const removeToken = new Object();

                  const ans = entry.tryApp(removeToken, getClaim(_lock).reverse());
                  if(ans[0] == 'canAdd') {
                    ans[1]();
                  }
                  else if(ans[0] == 'mustWait') {
                    entry.removeWaitingApp(token);
                  }
                });
            }

            reject(new CancelledError());
          })
        })
      );
    }
    

    function tryIncAllNow(items: Set<object>): boolean {
      const answers = items.map(tryIncOne);
      if(answers.every(([m]) => m == 'canAdd')) {
        answers.forEach(([,fn]) => (<DoTheInc>fn)());
        return true;
      }
      else {
        return false;
      }
    }

    function adoptOneIncAll(item: object, allItems: Set<object>, cb: (l:Lock)=>void): Waiter {
      return () => {
        const answers = allItems.subtract([item]).map(i => [i, tryIncOne(i)] as const);

        if(answers.every(([,[m]]) => m === 'canAdd')) {
          answers.forEach(([,[,fn]]) => (<DoTheInc>fn)());
          return () => cb(onSuccess(allItems));
        }
        else {
          answers.forEach(([i, ans]) => {
            if(ans[0] == 'mustWait') ans[1](adoptOneIncAll(i, allItems, cb));
          })

          return false;
        }
      }
    }

    function tryIncOne(item: object) {
      return _this
        .summonEntry(item)
        .tryApp(token,
          getClaim({
            release() { return _lock.release(); }
        }));
    }

    function onSuccess(items: Set<object>): Lock {
      return _lock = {
        release: async () => {
          const entries = items.map(i => _this.summonEntry(i));

          await Promise.all(entries.map(entry => {
            return new Promise<void>(resolve => {
              const ans = entry.tryApp(token, getClaim(_lock).reverse());
              if(ans[0] == 'canAdd') {
                ans[1]();
                resolve();
              }
              else if(ans[0] == 'mustWait') {
                ans[1](() => resolve);
              }
            })
          }))
        },

        extend(extras) {
          if(tryIncAllNow(extras.subtract(items))) {
            items = items.union(extras);
          }
          else throw 'can\'t extend onto locked items!';
        }
      };
    }

    function getClaim(r:Releasable) {
      return typeof cArg === 'function'
        ? cArg(r)
        : cArg[0];
    }
  }

  private summonEntry(i: object): Entry<X> {
    return this._entries.get(i)
      || (() => {
        const created = new Entry(this._default)
        this._entries.set(i, created);
        return created;
      })()
  }

  canApp(item: object, c: Claim<X>): boolean {
    const response = this.summonEntry(item).tryApp(new Object(), c);
    return response[0] == 'canAdd';
  }
}


interface Appl<X> {
  canApp(x: X): boolean
  app(x: X): X
  vip?: boolean
}

interface Claim<X> extends Appl<X> {
  reverse(): Appl<X>
}

class Entry<X> {
  private _x: X
  private _vips: OrderedMap<Token, [Appl<X>, Waiter]> //presumably Claim can replace Token
  private _waits: OrderedMap<Token, [Appl<X>, Waiter]> //presumably Claim can replace Token

  constructor(x: X) {
    this._x = x;
    this._vips = OrderedMap();
    this._waits = OrderedMap();
  }

  tryApp(k:Token, c: Appl<X>): ['canAdd',()=>void] | ['mustWait',(cb:Waiter)=>void] {
    return c.canApp(this._x)
      ? ['canAdd', () => {
          this.removeWaitingApp(k);
          this.app(c);
        }]
      : ['mustWait', waiter => {
          this.addWait(k, [c, waiter]);
        }];
  }

  private app(c: Appl<X>) {
    this._x = c.app(this._x);

    for(const [k, [cc, waiter]] of this.waits()) { //this._waits) {
      if(cc.canApp(this._x)) {
        this.removeWaitingApp(k);
        const cb = waiter();
        if(cb) {
          this.app(cc)
          cb();
          return;
        }
      }
    }
  }

  private addWait(k: Token, [a,w]: [Appl<X>, Waiter]) {
    if(a.vip) {
      this._vips = this._vips.set(k, [a,w]);
    }
    else {
      this._waits = this._waits.set(k, [a,w]);
    }
  }

  private waits() {
    return this._vips.entrySeq()
      .concat(this._waits.entrySeq());
  }
  
  removeWaitingApp(k: Token) {
    if(this._vips.has(k)) {
      this._vips = this._vips.delete(k);
    }
    else {
      this._waits = this._waits.delete(k);
    }
  }
}

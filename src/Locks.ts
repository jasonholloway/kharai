import {Set, OrderedMap} from 'immutable'
import _Monus, { NumberMonus } from './_Monus'

type Token = object
type Waiter = () => ((()=>void) | false);
type DoTheInc = () => void;

export type Lock = {
	release(): Promise<void>
	extend(extras: Set<object>): void
}

export class Locks<C> {
	private readonly _monus: _Monus<C>
	private readonly _defaultCount: C
	private readonly _entries: WeakMap<object, Entry<C>>

	constructor(monus: _Monus<C>, defaultCount: C) {
		this._monus = monus;
		this._defaultCount = defaultCount;
		this._entries = new WeakMap<object, Entry<C>>();
	}

	inc(items: object[], c: C): Promise<Lock> {
		return new Promise<Lock>(resolve => {
			const token = new Object();

			const incAll: (items: Set<object>) => void =
				(items) => {
					if(tryIncAllNow(items)) {
						resolve(handle(items));
					}
					else {
						const answers = items.map(i => [i, tryIncOne(i)] as const);
						answers.forEach(([i, ans]) => {
							if(ans[0] == 'mustWait') ans[1](adoptOneIncAll(i, items));
						});
					}
				};

			const tryIncAllNow: (items: Set<object>) => boolean =
				(items) => {
					const answers = items.map(tryIncOne);
					if(answers.every(([m]) => m == 'canAdd')) {
						answers.forEach(([,fn]) => (<DoTheInc>fn)());
						return true;
					}
					else {
						return false;
					}
				};

			const adoptOneIncAll: ((item: object, allItems: Set<object>) => Waiter) =
				(item, allItems) => () => {
					const answers = allItems.subtract([item]).map(i => [i, tryIncOne(i)] as const);

					if(answers.every(([,[m]]) => m === 'canAdd')) {
						answers.forEach(([,[,fn]]) => (<DoTheInc>fn)());
						return () => resolve(handle(allItems));
					}
					else {
						answers.forEach(([i, ans]) => {
							if(ans[0] == 'mustWait') ans[1](adoptOneIncAll(i, allItems));
						})

						return false;
					}
				}

			const tryIncOne =
				(item: object) => this.summonEntry(item).tryInc(token, c);

			const handle: (items: Set<object>) => Lock =
				(items) => ({
					release: async () => {
						const entries = items.map(i => this.summonEntry(i));
						
						await Promise.all(entries.map(entry => {
							return new Promise(resolve => {
								const subtraction = this._monus.subtract(this._monus.zero, c)
								const ans = entry.tryInc(token, subtraction);
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
				});

			incAll(Set(items));
		})
	}

	private summonEntry(i: object): Entry<C> {
		return this._entries.get(i)
		  || (() => {
				const created = new Entry(this._monus, this._defaultCount)
				this._entries.set(i, created);
				return created;
			})()
	}

	canInc(item: object, c: C): boolean {
		const response = this.summonEntry(item).tryInc(new Object(), c);
		return response[0] == 'canAdd';
	}
}

class Entry<C> {
	private _monus: _Monus<C>
	private _count: C
	private _waits: OrderedMap<Token, [C, Waiter]>

	constructor(monus: _Monus<C>,  count: C) {
		this._monus = monus;
		this._count = count;
		this._waits = OrderedMap();
	}

	tryInc(k:Token, c: C): ['canAdd',()=>void] | ['mustWait',(cb:Waiter)=>void] {
		return this.canInc(c)
		  ? ['canAdd', () => {
					this.removeWait(k);
					this.inc(c);
			  }]
		  : ['mustWait', waiter => {
					this.addWait(k, [c, waiter]);
			  }];
	}

	private inc(c: C) {
		this._count = this._monus.add(this._count, c);

		for(const [k, [cc, waiter]] of this._waits) {
			if(this.canInc(cc)) {
				this.removeWait(k);
				const cb = waiter();
				if(cb) {
					this.inc(cc)
					cb();
					return;
				}
			}
		}
	}

	private canInc(c: C) {
		return this._monus.add(this._count, c) != this._monus.zero;
	}

	private addWait(k: Token, tup: [C, Waiter]) {
		this._waits = this._waits.set(k, tup);
	}
	
	private removeWait(k: Token) {
		this._waits = this._waits.delete(k);
	}
}

export class SimpleLocks extends Locks<number> {
	constructor() {
		super(new NumberMonus(), 1);
	}
	
	canLock(item: object): boolean {
		return this.canInc(item, -1);
	}

  lock(...items: object[]) {
		return this.inc(items, -1);
	}
}

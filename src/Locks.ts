import {Set, OrderedMap} from 'immutable'

type Token = object
type Waiter = () => ((()=>void) | false);
type DoTheInc = () => void;

type Handle = {
	release(): Promise<void>
	extend(extras: Set<object>): void
}

export default class Locks {
	private readonly _defaultCount: number
	private readonly _entries: WeakMap<object, Entry>

	constructor(defaultAvail: number) {
		this._defaultCount = defaultAvail;
		this._entries = new WeakMap<object, Entry>();
	}

  lock(...items: object[]) {
		return this.inc(items, -1);
	}

	inc(items: object[], c: number): Promise<Handle> {
		return new Promise<Handle>(resolve => {
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

			const handle: (items: Set<object>) => Handle =
				(items) => ({
					release: async () => {
						const entries = items.map(i => this.summonEntry(i));
						
						await Promise.all(entries.map(entry => {
							return new Promise(resolve => {
								const ans = entry.tryInc(token, -c);
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

	private summonEntry(i: object): Entry {
		return this._entries.get(i)
		  || (() => {
				const created = new Entry(this._defaultCount)
				this._entries.set(i, created);
				return created;
			})()
	}

	canInc(item: object, c: number): boolean {
		const response = this.summonEntry(item).tryInc(new Object(), c);
		return response[0] == 'canAdd';
	}

	canLock(item: object): boolean {
		return this.canInc(item, -1);
	}
}

class Entry {
	private _avail: number
	private _waits: OrderedMap<Token, [number, Waiter]>

	constructor(avail: number) {
		this._avail = avail;
		this._waits = OrderedMap();
	}

	tryInc(k:Token, c: number): ['canAdd',()=>void] | ['mustWait',(cb:Waiter)=>void] {
		return this.canInc(c)
		  ? ['canAdd', () => {
					this.removeWait(k);
					this.inc(c);
			  }]
		  : ['mustWait', waiter => {
					this.addWait(k, [c, waiter]);
			  }];
	}

	private inc(c: number) {
		this._avail += c;

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

	private canInc(c: number) {
		return this._avail + c >= 0;
	}

	private addWait(k: Token, tup: [number, Waiter]) {
		this._waits = this._waits.set(k, tup);
	}
	
	private removeWait(k: Token) {
		this._waits = this._waits.delete(k);
	}
}

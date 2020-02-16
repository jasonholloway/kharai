import {Set, OrderedMap} from 'immutable'

type Token = object
type Releasable = () => void;
type Waiter = () => (((l:Releasable)=>void) | false);
type DoTheInc = () => Releasable;

type Handle = {
	release(): void
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
					const allDone = tryIncAllNow(items);
					if(allDone) {
						resolve(wrap(items, allDone));
					}
					else {
						const answers = items.map(i => [i, tryIncOne(i)] as const);
						answers.forEach(([i, ans]) => {
							if(ans[0] == 'mustWait') ans[1](adoptOneIncAll(i, items));
						});
					}
				};

			const tryIncAllNow: (items: Set<object>) => Set<Releasable>|false =
				(items) => {
					const answers = items.map(tryIncOne);
					if(answers.every(([m]) => m == 'canAdd')) {
						return answers.map(([,fn]) => (<DoTheInc>fn)());
					}
					else {
						return false;
					}
				};

			const adoptOneIncAll: ((item: object, allItems: Set<object>) => Waiter) =
				(item, allItems) => () => {
					const answers = allItems.subtract([item]).map(i => [i, tryIncOne(i)] as const);

					if(answers.every(([,[m]]) => m === 'canAdd')) {
						const locks = answers.map(([,[,fn]]) => (<DoTheInc>fn)());
						return lock =>
							resolve(wrap(allItems, locks.add(lock)));
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

			const wrap: (items: Set<object>, handles: Set<Releasable>) => Handle =
				(items, handles) => ({
					release() { handles.forEach(release => release()); },
					extend(extras) {
						const locked2 = tryIncAllNow(extras.subtract(items));
						if(locked2) {
							handles = handles.union(locked2);
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

	tryInc(k:Token, c: number): ['canAdd',()=>Releasable] | ['mustWait',(cb:Waiter)=>void] {
		return this.canInc(c)
		  ? ['canAdd', () => {
					this.removeWait(k);
					this.inc(c);
					return () => this.inc(-c);
			  }]
		  : ['mustWait', cb => {
					this.addWait(k, [c, cb]);
					return () => this.removeWait(k);
			  }];
	}

	private inc(c: number) {
		this._avail += c;

		for(const [k, [cc, waiter]] of this._waits) {
			if(this.canInc(cc)) {
				this.removeWait(k);
				const willAdopt = waiter();
				if(willAdopt) {
					this.inc(cc)
					willAdopt(() => this.inc(-cc));
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

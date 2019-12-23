import {Set, OrderedMap} from 'immutable'

type Token = object
type Releasable = () => void;
type Waiter = () => (((l:Releasable)=>void) | false);
type DoTheLock = () => Releasable;

export type Lock = {
	release(): void
	extend(extras: Set<object>): void
}

export default class LockRegistry {
	private _entries = new WeakMap<object, Entry>();

	readonly lock: (...items: object[]) => Promise<Lock> =
		(...items) => new Promise<Lock>(resolve => {
			const token = new Object();

			const lockAll: (items: Set<object>) => void =
				(items) => {
					const allLocked = tryLockAllNow(items);
					if(allLocked) {
						resolve(createLock(items, allLocked));
					}
					else {
						const answers = items.map(i => [i, tryLockItem(i)] as const);
						answers.forEach(([i, ans]) => {
							if(ans[0] == 'mustWait') ans[1](adoptOneLockAll(i, items));
						});
					}
				};

			const tryLockAllNow: (items: Set<object>) => Set<Releasable>|false =
				(items) => {
					const answers = items.map(tryLockItem);
					if(answers.every(([m]) => m == 'canLock')) {
						return answers.map(([,fn]) => (<DoTheLock>fn)());
					}
					else {
						return false;
					}
				};

			const adoptOneLockAll: ((item: object, allItems: Set<object>) => Waiter) =
				(item, allItems) => () => {
					const answers = allItems.subtract([item]).map(i => [i, tryLockItem(i)] as const);

					if(answers.every(([,[m]]) => m === 'canLock')) {
						let locked = answers.map(([,[,fn]]) => (<DoTheLock>fn)());
						return lock =>
							resolve(createLock(allItems, locked.add(lock)));
					}
					else {
						answers.forEach(([i, ans]) => {
							if(ans[0] == 'mustWait') ans[1](adoptOneLockAll(i, allItems));
						})

						return false;
					}
				}

			const tryLockItem =
				(item: object) => this.summonEntry(item).tryLock(token);

			const createLock: (items: Set<object>, locked: Set<Releasable>) => Lock =
				(items, locked) => ({
					release() { locked.forEach(release => release()); },
					extend(extras) {
						const locked2 = tryLockAllNow(extras.subtract(items));
						if(locked2) {
							locked = locked.union(locked2);
							items = items.union(extras);
						}
						else throw 'can\'t extend onto locked items!';
					}
				});

			lockAll(Set(items));
		})

	private summonEntry(i: object): Entry {
		return this._entries.get(i)
		  || (() => {
				const created = new Entry()
				this._entries.set(i, created);
				return created;
			})()
	}

	test(item: object): boolean {
		const response = this.summonEntry(item).tryLock(new Object());
		return response[0] == 'canLock';
	}
}

class Entry {
	private _isLocked = false
	private _waits = OrderedMap<Token, Waiter>()

	tryLock(k: Token): ['canLock',()=>Releasable] | ['mustWait',(cb:Waiter)=>void] {
		return !this._isLocked
		  ? ['canLock', () => {
					this._isLocked = true;
					this.removeWait(k);
					return () => this.unlock();
				}]
		  : ['mustWait', cb => {
					this.addWait(k, cb);
					return () => this.removeWait(k);
				}];
	}

	private unlock() {
		for(const [k,waiter] of this._waits) {
			this.removeWait(k);
			const willAdopt = waiter();
			if(willAdopt) {
				willAdopt(() => this.unlock());
				return;
			}
		}
		this._isLocked = false;
	}

	private addWait(k: Token, wait: Waiter) {
		this._waits = this._waits.set(k, wait);
	}
	
	private removeWait(k: Token) {
		this._waits = this._waits.delete(k);
	}
}

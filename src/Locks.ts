import {Set, OrderedMap} from 'immutable'

type Token = object
type Releasable = () => void;
type Waiter = () => (((l:Releasable)=>void) | false);
type DoTheLock = () => Releasable;

export type Lock = {
	release(): void
	extend(...items: object[]): void
}

export default class LockRegistry {
	private _entries = new WeakMap<object, Entry>();

	readonly lock = (...items: object[]) => new Promise<Lock>(resolve => {
		const token = new Object();
		const _items = Set(items);

		const lockAll =
			() => {
				const answers = items.map(i => [i, lockOne(i)] as const);

				if(answers.every(([,[m]]) => m === 'canLock')) {
					const locked = answers.map(([,[,fn]]) => (<DoTheLock>fn)()); 
					resolve({
						release() { locked.forEach(l => l()) },
						extend() {}
					});
				}
				else {
					answers.forEach(([i, ans]) => {
						if(ans[0] == 'mustWait') ans[1](adoptOneLockAll(i));
					})
				}
			};

		const lockOne =
			(item: object) => this.summonEntry(item).tryLock(token);

		const adoptOneLockAll: ((item: object) => Waiter) =
			(item) => () => {
				const answers = _items.subtract([item]).map(i => [i, lockOne(i)] as const);

				if(answers.every(([,[m]]) => m === 'canLock')) {
					const locked = answers.map(([,[,fn]]) => (<DoTheLock>fn)());
					return lock => {
						resolve({
							release() { locked.add(lock).forEach(l => l()) },
							extend() {}
						});
					}
				}
				else {
					answers.forEach(([i, ans]) => {
						if(ans[0] == 'mustWait') ans[1](adoptOneLockAll(i));
					})

					return false;
				}
			}

		lockAll();
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

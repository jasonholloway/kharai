import {Set, OrderedMap} from 'immutable'

type Token = object
type Lock = () => void
type Waiter = () => (((l:Lock)=>void) | false);
type DoTheLock = () => Lock;

export default class LockRegistry {
	private _entries = new WeakMap<object, Entry>();

	readonly lock = (...items: object[]) => new Promise<Lock>(resolve => {
		const _items = Set(items);
		const token = new Object();
		const tryLock = (i: object) => this.summonEntry(i).tryLock(token);

		const answers = _items.map(i => [i, tryLock(i)] as const);

		if(answers.every(([,[m]]) => m === 'canLock')) {
			const locked = answers.map(([,[,fn]]) => (<DoTheLock>fn)()); 
			resolve(() => locked.forEach(l => l()));
		}
		else {
			answers
				.filter(([,[m]]) => m === 'mustWait')
				.forEach(([item, [,waitForLock]]) => {
					waitForLock(() => {
						const answers2 = _items.subtract([item]).map(tryLock);

						if(answers2.every(([m,]) => m === 'canLock')) {
							const locked = answers2.map(([,fn]) => (<DoTheLock>fn)());
							return lock => {
								resolve(() => locked.add(lock).forEach(l => l()));
							}
						}
						else {
							return false;
						}
					})
			})
		}
	})

	private summonEntry(i: object): Entry {
		return this._entries.get(i)
		  || (() => {
				const created = new Entry()
				this._entries.set(i, created);
				return created;
			})()
	}
}

class Entry {
	private _isLocked = false
	private _waits = OrderedMap<Token, Waiter>()

	tryLock(k: Token): ['canLock',()=>Lock] | ['mustWait',(cb:Waiter)=>void] {
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
			const willAdopt = waiter();
			if(willAdopt) {
				this.removeWait(k);
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

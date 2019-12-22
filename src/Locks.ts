import {Set, OrderedMap} from 'immutable'

type Token = object
type Lock = () => void
type Waiter = () => (((l:Lock)=>void) | false);
type DoTheLock = () => Lock;

export default class LockRegistry {
	private _entries = new WeakMap<object, Entry>();

	readonly lock = (...items: object[]) => new Promise<Lock>(resolve => {
		const token = new Object();
		const _items = Set(items);

		const answers = _items.map(i => [i, lockOne(i)] as const);

		if(answers.every(([,[m]]) => m === 'canLock')) {
			const locked = answers.map(([,[,fn]]) => (<DoTheLock>fn)()); 
			resolve(() => locked.forEach(l => l()));
		}
		else {
			answers.forEach(([i, ans]) => {
				if(ans[0] == 'mustWait') ans[1](adoptLockRest(i));
			})
		}

		const lockOne =
			(item: object) => this.summonEntry(item).tryLock(token);

		const adoptLockRest: ((item: object) => Waiter) =
			(item) => () => {
				const answers = _items.subtract([item]).map(i => [i, lockOne(i)] as const);

				if(answers.every(([,[m]]) => m === 'canLock')) {
					const locked = answers.map(([,[,fn]]) => (<DoTheLock>fn)());
					return lock => {
						resolve(() => locked.add(lock).forEach(l => l()));
					}
				}
				else {
					answers.forEach(([i, ans]) => {
						if(ans[0] == 'mustWait') ans[1](adoptLockRest(i));
					})

					return false;
				}
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

	//if entry had reference to item, would item ever be cleared up?
	//the entry itself would be kept in circulation as long as the item exists
	//but then the entry itself references the item, keeping it, and itself, in circulation
	//so... the entry can't reference the object

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
			this.removeWait(k); //wait removed on firing; waits on others will be registered by the waiter to carry the flame
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

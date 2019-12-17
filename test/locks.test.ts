import { Set, List, OrderedMap, OrderedSet} from 'immutable'
import {delay} from './helpers'

type Lock = { release(): void }
type LockerKey = { ts: number }

type LockerCb = () => ((l:Lock)=>void);
type Lockers = OrderedMap<LockerKey, LockerCb>

//the list of listeners gets called one by one 
//if the callback manages to lock all, then it returns true to the caller
//claiming the lock that just enlivened it

	//but in checking its other locks
	//how can it know which are available?
	//because it will try them one by one
	//
	//whenever a lock is released, each waiter in tuurn is informed till one says 'yes'
	//then this removes the waiter from the list, but also puts the lock back into the 'locked' state
	//till someone releases it
	//
	//if the waiter wants it (because all other locks are apparently available to it)
	//it receives a lock which it can combine with all other just-locked locks
	//
	//problem here is that such a lock, as it only occasionally gets a look in, is always going to be badly gazumped
	//by smaller lockers, which can nip in and claim what they like
	//
	//a lock is released; each waiter is asked in turn whether it wants to take it (as it has first dibs on it, having waited for a while)
	//it then speculatively tries to take other 
	//
	//but these other ones it tries to take, it might already be registered to wait on these... in which case it also needs to make sure it is removed from the ordered set for these
	

class LockRegistry {
	private _locks = new WeakMap<object, Lockers>();

	private releaseItem(k: LockerKey, i: object): void {
		const entry = this._locks.get(i);
		if(entry) {
			this._locks.set(i, entry.delete(k))
			//now notify next waiters... 
		}
	}
		
	private lockItem(k: LockerKey, i: object): [true, ()=>Lock] | [false, (cb:LockerCb)=>()=>void] {
		const entry = this._locks.get(i);
		if(entry) {
			return [false, (cb) => {
								this._locks.set(i, entry.set(k, cb));

								return () => {
									const entry = this._locks.get(i);
									if(entry) {
										this._locks.set(i, entry.delete(k));
									}
								}
							}];
		}
		else {
			this._locks.set(i, OrderedMap<LockerKey, LockerCb>( ))
			return [true, () => ({
								release: () => {
									this.releaseItem(k, i);
								}
							})];
		}
	}
	
	async lock(...lockables: object[]): Promise<Lock> {
		const k = { ts: Date.now() };
		const items = Set(lockables);
		
		const answers1 = items.map(i => this.lockItem(k, i))

		if(answers1.every(([success,]) => success)) {
			const locks = answers1.map(([,fn]) => (<()=>Lock>fn)()); 
			
			return Promise.resolve({
				release: () => locks.forEach(l => l.release())
			})
		}

		//if we can't just lock up front, then we have to start installing waiters etc...
		//....
		
		throw 'todo!'
	}

}


describe('locks', () => {

	let registry: LockRegistry
	const _1 = new Object();
	const _2 = new Object();
	const _3 = new Object();

	beforeEach(() => {
		registry = new LockRegistry();
	})

	it('can simply lock and release', async () => {
		const lock = await registry.lock(_1);
		lock.release();
	})

	it('contention on one object', async () => {
		let locked2 = false;
		
		const lock1 = await registry.lock(_1);

		registry.lock(_1)
			.then(() => locked2 = true)

		await delay(10);
		expect(locked2).toBeFalsy();

		lock1.release();
		await delay(0);
		expect(locked2).toBeTruthy();
	})

	it('many objects, partial contention', async () => {
		let locked2 = false;
		
		const lock1 = await registry.lock(_1, _2)

		registry.lock(_2, _3)
			.then(() => locked2 = true);

		await delay(50);
		expect(locked2).toBeFalsy();

		lock1.release();
		await delay(0);
		expect(locked2).toBeTruthy();
	})
	
})




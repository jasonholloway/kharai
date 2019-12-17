import {Set} from 'immutable'
import {delay} from './helpers'

type Lock = { release(): void }

class LockRegistry {
	private _locks = new WeakMap<any, [() => void, Promise<void>]>();

	private _lock(items: Set<any>) {
	}

	private _release(items: Set<any>) {
	}
		
	async lock(...lockables: any[]): Promise<Lock> {
		const isFree = i => !this._locks.has(i);
		const lockItem = i => this._locks.set(i, undefined); //!!!!!!
		const unlockItem = i => this._locks.delete(i);
		const items = Set(lockables);

		if(items.every(isFree)) {
			items.forEach(lockItem);
		}

		//otherwise wait till it might be likely
		//should chain promise thens onto itemLocks
		//...
		
		return {
			release() {
				items.forEach(unlockItem);
				//trigger reassesments of other locks
				//...
			}
		}
	}

}




describe('locks', () => {

	let registry: LockRegistry

	beforeEach(() => {
		registry = new LockRegistry();
	})

	it('simple', async () => {
		let locked2 = false;
		
		const lock1 = await registry.lock(1, 2)

		registry.lock(2, 3)
			.then(() => locked2 = true);

		await delay(50);
		expect(locked2).toBeFalsy();

		lock1.release();
		await delay(0);
		expect(locked2).toBeTruthy();
	})
	
})




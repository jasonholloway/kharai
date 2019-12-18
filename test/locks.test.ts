import Locks from '../src/Locks'
import {delay} from './helpers'

describe('locks', () => {
	let locks: Locks
	const _1 = new Object();
	const _2 = new Object();
	const _3 = new Object();

	beforeEach(() => {
		locks = new Locks();
	})

	it('can simply lock and release', async () => {
		const unlock = await locks.lock(_1);
		unlock();
	})

	it('contention on one object', async () => {
		let locked2 = false;
		
		const unlock = await locks.lock(_1);

		locks.lock(_1)
			.then(() => locked2 = true)

		await delay(10);
		expect(locked2).toBeFalsy();

		unlock();
		await delay(0);
		expect(locked2).toBeTruthy();
	})

	it('many objects, partial contention', async () => {
		let locked2 = false;
		
		const unlock = await locks.lock(_1, _2)

		locks.lock(_2, _3)
			.then(() => locked2 = true);

		await delay(50);
		expect(locked2).toBeFalsy();

		unlock();
		await delay(0);
		expect(locked2).toBeTruthy();
	})
	
})




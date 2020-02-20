import { Locks, Semaphores, Exchange } from '../src/Locks'
import {delay} from './helpers'
import { Chooser, many, seedChooser, gen, pick, integer} from '../src/genau'
import { List, Set } from 'immutable'

describe('locks', () => {
	let run: Chooser;

	const _1 = [1];
	const _2 = [2];
	const _3 = [3];

	beforeEach(() => {
		run = seedChooser(820);
	})

	describe('Exchange, instances offered/claimed', () => {
		let exchange: Exchange<{}>

		beforeEach(() => {
			exchange = new Exchange()
		})

		it('nothing claimable before offer', async () => {
			let claimed = false;

			const claiming = exchange.claim(_1);
			claiming.then(() => claimed = true);
			await delay(30);

			expect(claimed).toBeFalsy();
		})

		it('claimable when offered', async () => {
			let claimed = false;

			const claiming = exchange.claim(_1, _2, _3);
			claiming.then(() => claimed = true);

			await exchange.offer([_1, _2], {});
			await delay(30);
			expect(claimed).toBeFalsy();

			await exchange.offer([_3], {});
			await delay(30);
			expect(claimed).toBeTruthy();
		})

		it('doesnt release immediately', async () => {
			let released = false;

			const offer = await exchange.offer([_1, _2], {});
			const claim = await exchange.claim(_1, _2);

			const releasing = offer.release();
			releasing.then(() => released = true);
			await delay(30);
			expect(released).toBeFalsy();

			await claim.release();
			expect(released).toBeTruthy();
		})

		it('offered contexts are accessible via handle', async () => {
			const x1 = '1';
			const x2 = '2';
			
			await exchange.offer([_1, _2], x1);
			await exchange.offer([_3], x2);

			const claim1 = await exchange.claim(_1);
			const claim2 = await exchange.claim(_2, _3);
			expect([...claim1.offers()]).toEqual([x1]);
			expect([...claim2.offers()]).toEqual([x1, x2]);

			await claim2.release();
			const claim3 = await exchange.claim(_3);
			expect([...claim3.offers()]).toEqual([x2])
		})
	})

	describe('Semaphore, requiring supply', () => {
		let locks: Semaphores;

		beforeEach(() => {
			locks = new Semaphores();
		})

		it('unavailable by default', () => {
			const available = locks.canInc([_1], -1);
			expect(available).toBeFalsy();
		})

		it('no lock without supply', async () => {
			let locked = false;

			locks.inc([_1], -1)
			  .then(() => locked = true);

			await delay(50);

			expect(locked).toBeFalsy();
		})

		it('locks after supply', async () => {
			let locked = false;
			
			locks.inc([_1], -1)
			  .then(() => locked = true);

			await locks.inc([_1], 1);
			
			await delay(50);

			expect(locked).toBeTruthy();
		})

		it('releases incrs', async () => {
			let isLocked1 = false;
			let isLocked2 = false;
			let isReleased1 = false;
			
			const locking1 = locks.inc([_1], -1)
			locking1.then(() => isLocked1 = true);
			await delay(10);
			expect(isLocked1).toBeFalsy();

			const incr = await locks.inc([_1], 1);
			await delay(10);
			expect(isLocked1).toBeTruthy();

			incr.release().then(() => isReleased1 = true);
			await delay(10);
			expect(isReleased1).toBeFalsy();

			const lock1 = await locking1;
			await lock1.release();
			await delay(10);
			expect(isReleased1).toBeTruthy();

			locks.inc([_1], -1).then(() => isLocked2 = true);
			await delay(10);
			expect(isLocked2).toBeFalsy();
		})
	})

	describe('Lock, take only', () => {
		let locks: Locks
		
		beforeEach(() => {
			locks = new Locks();
		})

		it('available by default', () => {
			const available = locks.canLock(_1);
			expect(available).toBeTruthy();
		})

		it('can simply lock and release', async () => {
			const lock = await locks.lock(_1);
			lock.release();
		})

		it('contention on one object', async () => {
			let locked2 = false;

			const lock = await locks.lock(_1);

			locks.lock(_1)
				.then(() => locked2 = true)

			await delay(10);
			expect(locked2).toBeFalsy();

			await lock.release();
			await delay(0);
			expect(locked2).toBeTruthy();
		})

		it('many objects, partial contention', async () => {
			let locked2 = false;

			const lock = await locks.lock(_1, _2)

			locks.lock(_2, _3)
				.then(() => locked2 = true);

			await delay(50);
			expect(locked2).toBeFalsy();

			await lock.release();
			await delay(0);
			expect(locked2).toBeTruthy();
		})

		it('contending on two objects', () =>
			Promise.all([
				locks.lock(_1).then(lock => delay(100).then(() => lock.release())),
				locks.lock(_1, _2).then(lock => delay(100).then(() => lock.release())),
				locks.lock(_2).then(lock => delay(100).then(() => lock.release()))
			]))

		it('loads of knotty contentions', async () => {
			const items = [{i:1}, {i:2}, {i:3}, {i:4}, {i:5}];

			const threads = run(gen(choose => {
				return choose(many(10, gen(() => ({
					duration: choose(integer(10, 200)),
					toLock: choose(pick(0.3, List(items)))
				}))));
			}));

			await Promise.all(
				threads.map(async ({ duration, toLock }) => {
					const lock = await locks.lock(...toLock)
					await delay(duration);
					await lock.release();
				}));
		})

		it('extending existing lock to include new and non-contentious', async () => {
			const lock = await locks.lock(_1, _2);
			lock.extend(Set([_3]));
			expect(locks.canLock(_3)).toBeFalsy();

			await lock.release();
			expect(locks.canLock(_3)).toBeTruthy();
		})
	})

})


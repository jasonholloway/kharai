import { Locks, Semaphores, Exchange, Lock } from '../src/Locks'
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

			const claiming = exchange.claim(_1).promise();
			claiming.then(() => claimed = true);
			await delay(30);

			expect(claimed).toBeFalsy();
		})

		it('claimable when offered', async () => {
			let claimed = false;

			const claiming = exchange.claim(_1, _2, _3).promise();
			claiming.then(() => claimed = true);

			await exchange.offer([_1, _2], {}).promise();
			await delay(30);
			expect(claimed).toBeFalsy();

			await exchange.offer([_3], {}).promise();
			await delay(30);
			expect(claimed).toBeTruthy();
		})

		it('doesnt release immediately', async () => {
			let released = false;

			const offer = await exchange.offer([_1, _2], {}).promise();
			const claim = await exchange.claim(_1, _2).promise();

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
			
			await exchange.offer([_1, _2], x1).promise();
			await exchange.offer([_3], x2).promise();

			const claim1 = await exchange.claim(_1).promise();
			const claim2 = await exchange.claim(_2, _3).promise();
			expect([...claim1.offers()]).toEqual([x1]);
			expect([...claim2.offers()]).toEqual([x1, x2]);

			await claim2.release();
			const claim3 = await exchange.claim(_3).promise();
			expect([...claim3.offers()]).toEqual([x2])
		})

		it('cancelling releases each party', async () => {
			expect.assertions(2);

			const claiming = exchange.claim(_1).promise();

			await exchange.offer([_2], 'blocker').promise();
			const offering = exchange.offer([_2], {}).promise();

			claiming.cancel();
			offering.cancel();
			
			await Promise.all([
				claiming
					.catch(e => expect(e).toEqual(Error('Cancelled'))),

				offering
					.catch(e => expect(e).toEqual(Error('Cancelled')))
			])
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

			locks.inc([_1], -1).promise()
			  .then(() => locked = true);

			await delay(50);

			expect(locked).toBeFalsy();
		})

		it('locks after supply', async () => {
			let locked = false;
			
			locks.inc([_1], -1).promise()
			  .then(() => locked = true);

			await locks.inc([_1], 1).promise();
			
			await delay(50);

			expect(locked).toBeTruthy();
		})

		it('releases incrs', async () => {
			let isLocked1 = false;
			let isLocked2 = false;
			let isReleased1 = false;
			
			const locking1 = locks.inc([_1], -1).promise();
			locking1.then(() => isLocked1 = true);
			await delay(10);
			expect(isLocked1).toBeFalsy();

			const incr = await locks.inc([_1], 1).promise();
			await delay(10);
			expect(isLocked1).toBeTruthy();

			incr.release().then(() => isReleased1 = true);
			await delay(10);
			expect(isReleased1).toBeFalsy();

			const lock1 = await locking1;
			await lock1.release();
			await delay(10);
			expect(isReleased1).toBeTruthy();

			locks.inc([_1], -1).promise().then(() => isLocked2 = true);
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
			const lock = await locks.lock(_1).promise();
			lock.release();
		})

		it('contention on one object', async () => {
			let locked2 = false;

			const lock = await locks.lock(_1).promise();

			locks.lock(_1).promise()
				.then(() => locked2 = true)

			await delay(10);
			expect(locked2).toBeFalsy();

			await lock.release();
			await delay(0);
			expect(locked2).toBeTruthy();
		})

		it('many objects, partial contention', async () => {
			let locked2 = false;

			const lock = await locks.lock(_1, _2).promise();

			locks.lock(_2, _3).promise()
				.then(() => locked2 = true);

			await delay(50);
			expect(locked2).toBeFalsy();

			await lock.release();
			await delay(0);
			expect(locked2).toBeTruthy();
		})

		it('contending on two objects', () =>
			Promise.all([
				locks.lock(_1).promise().then(lock => delay(100).then(() => lock.release())),
				locks.lock(_1, _2).promise().then(lock => delay(100).then(() => lock.release())),
				locks.lock(_2).promise().then(lock => delay(100).then(() => lock.release()))
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
					const lock = await locks.lock(...toLock).promise();
					await delay(duration);
					await lock.release();
				}));
		})

		it('extending existing lock to include new and non-contentious', async () => {
			const lock = await locks.lock(_1, _2).promise();
			lock.extend(Set([_3]));
			expect(locks.canLock(_3)).toBeFalsy();

			await lock.release();
			expect(locks.canLock(_3)).toBeTruthy();
		})

		it('can preempt lock', async () =>{
			const [r, lock] = locks.lock(_1, _2).preempt();
			expect(r).toBeTruthy();

			expect(locks.canLock(_1)).toBeFalsy();
			expect(locks.canLock(_2)).toBeFalsy();
			expect(locks.canLock(_3)).toBeTruthy();

			await (<Lock>lock).release();

			expect(locks.canLock(_1)).toBeTruthy();
			expect(locks.canLock(_2)).toBeTruthy();
			expect(locks.canLock(_3)).toBeTruthy();
		})
	})

})


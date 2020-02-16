import Locks from '../src/Locks'
import {delay} from './helpers'
import { Chooser, many, seedChooser, gen, pick, integer} from '../src/genau'
import { List, Set } from 'immutable'

describe('locks', () => {
	let run: Chooser;

	let locks: Locks;
	const _1 = new Object();
	const _2 = new Object();
	const _3 = new Object();

	beforeEach(() => {
		run = seedChooser(820);
	})

	describe('as Locks(0), requiring supply', () => {

		beforeEach(() => {
			locks = new Locks(0);
		})

		it('unavailable by default', () => {
			const available = locks.canLock(_1);
			expect(available).toBeFalsy();
		})

		it('no lock without supply', async () => {
			let locked = false;

			locks.lock(_1)
			  .then(() => locked = true);

			await delay(50);

			expect(locked).toBeFalsy();
		})

		it('lock after supply', async () => {
			let locked = false;
			
			locks.lock(_1)
			  .then(() => locked = true);

			await locks.inc([_1], 1);
			
			await delay(50);

			expect(locked).toBeTruthy();
		})
		
	})
	

	describe('as Locks(1)', () => {
		beforeEach(() => {
			locks = new Locks(1);
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

			lock.release();
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

			lock.release();
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
					lock.release();
				}));
		})

		it('extending existing lock to include new and non-contentious', async () => {
			const lock = await locks.lock(_1, _2);
			lock.extend(Set([_3]));
			expect(locks.canLock(_3)).toBeFalsy();

			lock.release();
			expect(locks.canLock(_3)).toBeTruthy();
		})
	})

})


import Locks from '../src/Locks'
import {delay} from './helpers'
import { Chooser, many, seedChooser, gen, pick, integer} from '../src/genau'
import { List } from 'immutable'

describe('locks', () => {
	let run: Chooser;

	let locks: Locks
	const _1 = new Object();
	const _2 = new Object();
	const _3 = new Object();

	beforeEach(() => {
		run = seedChooser(820);
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
	
	it('contending on two objects', () =>
		Promise.all([
			locks.lock(_1).then(unlock => delay(100).then(() => unlock())),
			locks.lock(_1, _2).then(unlock => delay(100).then(() => unlock())),
			locks.lock(_2).then(unlock => delay(100).then(() => unlock()))
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
				const unlock = await locks.lock(...toLock)
				await delay(duration);
				unlock();
			}));
	})
})


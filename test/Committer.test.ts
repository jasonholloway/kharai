import AtomSpace, { Head } from '../src/AtomSpace'
import Committer, { Commit } from '../src/Committer'
import _Monoid from '../src/_Monoid'
import { delay } from '../src/util'
import { Subject } from 'rxjs/internal/Subject'
import { ReplaySubject } from 'rxjs/internal/ReplaySubject'
import { gather } from './helpers'

describe('committable', () => {
	let space: AtomSpace<number>
	let log$: Subject<Commit<number>>
	const newCommitter = (h: Head<number>) => new Committer(new MonoidNumber(), h, log$);  

	beforeEach(() => {
		space = new AtomSpace();
		log$ = new ReplaySubject();
	})

	it('commits singly', async () => {
		const head = space.spawnHead();
		const commit = newCommitter(head);
		expect(head.ref().resolve()).toBeUndefined();

		await commit.complete(3);
		expect(head.ref().resolve()?.val).toEqual(3)
	})

	it('commits trebly', async () => {
		const h1 = space.spawnHead();
		const c1 = newCommitter(h1);

		const h2 = space.spawnHead();
		const c2 = newCommitter(h2);

		const h3 = space.spawnHead();
		const c3 = newCommitter(h3);

		Committer.combine(new MonoidNumber(), [c1, c2, c3]);

		const committing1 = c1.complete(3);
		await delay(15);
		expect(h1.ref().resolve()).toBeUndefined();

		const committing2 = c2.complete(5);
		await delay(15);
		expect(h1.ref().resolve()).toBeUndefined();
		expect(h2.ref().resolve()).toBeUndefined();

		await Promise.all([c3.complete(7), committing1, committing2]);
		expect(h1.ref().resolve()?.val).toEqual(15);
		expect(h2.ref().resolve()?.val).toEqual(15);
		expect(h3.ref().resolve()?.val).toEqual(15);
	})

	it('completes after all commit', async () => {
		const h1 = space.spawnHead();
		const c1 = newCommitter(h1);

		const h2 = space.spawnHead();
		const c2 = newCommitter(h2);

		Committer.combine(new MonoidNumber(), [c1, c2]);

		let commited1 = false;
		const committing1 = c1.complete(3);
		committing1.then(() => commited1 = true);
		await delay(15);
		expect(commited1).toBeFalsy();

		await Promise.all([c2.complete(5), committing1]);
		expect(commited1).toBeTruthy();
	})

	it('emits commits to sink', async () => {
		const gathering = gather(log$);

		const h1 = space.spawnHead();
		const c1 = newCommitter(h1);

		const h2 = space.spawnHead();
		const c2 = newCommitter(h2);

		Committer.combine(new MonoidNumber(), [c1, c2]);
		await Promise.all([
			c1.complete(3),
			c2.complete(5),
		]);

		const c3 = newCommitter(h1);
		await c3.complete(7);

		log$.complete();
		const logs = await gathering;
		expect(logs.length).toBe(2);
		expect(logs[0][1].resolve()?.val).toBe(8);
		expect(logs[1][1].resolve()?.val).toBe(7);
	})
})

class MonoidNumber implements _Monoid<number> {
  zero: number = 0
	add(a: number, b: number): number {
		return a + b;
  }
}

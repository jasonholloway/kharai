import AtomSpace from '../src/AtomSpace'
import Commit from '../src/Commit'
import _Monoid from '../src/_Monoid'
import { delay } from '../src/util'

describe('committable', () => {
	let space: AtomSpace<number>

	beforeEach(() => {
		space = new AtomSpace();
	})

	it('commits singly', async () => {
		const head = space.spawnHead();
		const commit = new Commit(new MonoidNumber(), head);
		expect(head.ref().resolve()).toBeUndefined();

		await commit.complete(3);
		expect(head.ref().resolve().val).toEqual(3)
	})

	it('commits trebly', async () => {
		const h1 = space.spawnHead();
		const c1 = new Commit(new MonoidNumber(), h1);

		const h2 = space.spawnHead();
		const c2 = new Commit(new MonoidNumber(), h2);

		const h3 = space.spawnHead();
		const c3 = new Commit(new MonoidNumber(), h3);

		Commit.join(new MonoidNumber(), [c1, c2, c3]);

		const committing1 = c1.complete(3);
		await delay(15);
		expect(h1.ref().resolve()).toBeUndefined();

		const committing2 = c2.complete(5);
		await delay(15);
		expect(h1.ref().resolve()).toBeUndefined();
		expect(h2.ref().resolve()).toBeUndefined();

		await Promise.all([c3.complete(7), committing1, committing2]);
		expect(h1.ref().resolve().val).toEqual(15);
		expect(h2.ref().resolve().val).toEqual(15);
		expect(h3.ref().resolve().val).toEqual(15);
	})

	it('completes after all commit', async () => {
		const h1 = space.spawnHead();
		const c1 = new Commit(new MonoidNumber(), h1);

		const h2 = space.spawnHead();
		const c2 = new Commit(new MonoidNumber(), h2);

		Commit.join(new MonoidNumber(), [c1, c2]);

		let commited1 = false;
		const committing1 = c1.complete(3);
		committing1.then(() => commited1 = true);
		await delay(15);
		expect(commited1).toBeFalsy();

		await Promise.all([c2.complete(5), committing1]);
		expect(commited1).toBeTruthy();
	})
})

class MonoidNumber implements _Monoid<number> {
  zero: number = 0
	add(a: number, b: number): number {
		return a + b;
  }
}

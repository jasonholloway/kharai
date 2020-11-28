import AtomSpace, { Head } from '../src/AtomSpace'
import Commit from '../src/Committer'
import _Monoid from '../src/_Monoid'
import { delay } from '../src/util'
import { AtomRef, Atom } from '../src/atoms'
import { List } from 'immutable'
import { Subject } from 'rxjs'
import { Signal } from './MachineSpace'

const atoms = <V>(rs: List<AtomRef<V>>) => rs.flatMap(r => r.resolve()).toArray()

describe('committable', () => {
	let kill$ = new Subject<Signal>();
	let space: AtomSpace<number>
	const newCommit = (h: Head<number>) => new Commit(new MonoidNumber(), h);  

	beforeEach(() => {
		space = new AtomSpace(kill$);
	})

	afterEach(() => {
		kill$.next({ stop: true });
	})

	it('commits singly', async () => {
		const head = space.head();
		const commit = newCommit(head);
		expect(atoms(head.refs())).toEqual([]);

		await commit.complete(3);

		const [atom] = atoms(head.refs());
		expect(atom?.val).toEqual(3)
	})

	it('commits trebly', async () => {
		const h1 = space.head();
		const c1 = newCommit(h1);

		const h2 = space.head();
		const c2 = newCommit(h2);

		const h3 = space.head();
		const c3 = newCommit(h3);

		Commit.combine(new MonoidNumber(), [c1, c2, c3]);
		
		const committing1 = c1.complete(3);
		await delay(15);
		expect(atoms(h1.refs())).toEqual([]);

		const committing2 = c2.complete(5);
		await delay(15);
		expect(atoms(h1.refs())).toEqual([]);
		expect(atoms(h2.refs())).toEqual([]);

		await Promise
			.all([c3.complete(7), committing1, committing2]);

		expect(atoms(h1.refs())[0]?.val).toEqual(15);
		expect(atoms(h2.refs())[0]?.val).toEqual(15);
		expect(atoms(h3.refs())[0]?.val).toEqual(15);
	})

	it('completes after all commit', async () => {
		const h1 = space.head();
		const c1 = newCommit(h1);

		const h2 = space.head();
		const c2 = newCommit(h2);

		Commit.combine(new MonoidNumber(), [c1, c2]);

		let commited1 = false;
		const committing1 = c1.complete(3);
		committing1.then(() => commited1 = true);
		await delay(15);
		expect(commited1).toBeFalsy();

		await Promise.all([c2.complete(5), committing1]);
		expect(commited1).toBeTruthy();
	})

	it('atoms returned from commits', async () => {
		const h1 = space.head();
		const c1 = newCommit(h1);

		const h2 = space.head();
		const c2 = newCommit(h2);

		Commit.combine(new MonoidNumber(), [c1, c2]);
		const [a1, a2] = await Promise.all([
			c1.complete(3),
			c2.complete(5),
		]);

		const c3 = newCommit(h1);
		const a3 = await c3.complete(7);
		
		expect(a1.resolve()[0]?.val).toBe(8);
		expect(a2.resolve()[0]?.val).toBe(8);
		expect(a3.resolve()[0]?.val).toBe(7);
	})

	it('multiple recombinations', async () => {
		const h1 = space.head();
		const c1 = newCommit(h1);

		const h2 = space.head();
		const c2 = newCommit(h2);

		Commit.combine(new MonoidNumber(), [c1, c2]);
		Commit.combine(new MonoidNumber(), [c1, c2]);
		Commit.combine(new MonoidNumber(), [c1, c2]);

		const [a1, a2] = await Promise.all([
			c1.complete(3),
			c2.complete(5),
		]);

		expect(a1.resolve()[0]?.val).toBe(8);
		expect(a2.resolve()[0]?.val).toBe(8);
	})

	it('accepts extra upstreams', async () => {
		const h = space.head();
		const c1 = newCommit(h);

		const u1 = new Atom(List(), 3);
		const u2 = new Atom(List(), 4);

		c1.add(List([new AtomRef(u1), new AtomRef(u2)]));

		const a2 = await c1.complete(13);

		expect(atoms(List([a2]))[0].val)
			.toEqual(13);

		expect(atoms(h.refs())[0].val)
			.toEqual(13);

		const parents = List(atoms(h.refs()))
			.flatMap(r => r.parents);

		expect(atoms(parents)).toContain(u1);
		expect(atoms(parents)).toContain(u2);
	})

	it('upstreams are simplified on addition', async () => {
		const h1 = space.head();
		h1.write(0);
		const c = newCommit(h1);

		const h2 = space.head();
		h2.write(1);
		c.add(h2.refs());

		h2.write(2);
		c.add(h2.refs());

		h2.write(3);
		c.add(h2.refs());

		await c.complete(9);

		const upstreams1 = atoms(h1.refs());
		expect(upstreams1).toHaveLength(1);
		expect(upstreams1.map(a => a.val)).toContain(9);

		const upstreams2 = atoms(List(upstreams1).flatMap(r => r.parents))
		expect(upstreams2).toHaveLength(2);
		expect(upstreams2.map(a => a.val)).toContain(0);
		expect(upstreams2.map(a => a.val)).toContain(3);
	})
})

class MonoidNumber implements _Monoid<number> {
  zero: number = 0
	add(a: number, b: number): number {
		return a + b;
  }
}

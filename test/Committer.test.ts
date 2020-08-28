import AtomSpace, { Head } from '../src/AtomSpace'
import Commit from '../src/Committer'
import _Monoid from '../src/_Monoid'
import { delay } from '../src/util'
import { gather } from './helpers'
import { AtomRef, Atom } from '../src/atoms'
import { ReplaySubject } from 'rxjs/internal/ReplaySubject'
import { Subject } from 'rxjs/internal/Subject'
import { Set } from 'immutable'

const atoms = <V>(rs: Set<AtomRef<V>>) => rs.flatMap(r => r.resolve()).toArray()

describe('committable', () => {
	let space: AtomSpace<number>
	let atom$: Subject<AtomRef<number>>
	const newCommit = (h: Head<number>) => new Commit(new MonoidNumber(), h, atom$);  

	beforeEach(() => {
		space = new AtomSpace();
		atom$ = new ReplaySubject();
	})

	it('commits singly', async () => {
		let head = space.head();
		const commit = newCommit(head);
		expect(atoms(head.refs())).toEqual([]);

		[head] = await commit.complete(3);

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

		const [[h12], [h22], [h32]] = await Promise
			.all([c3.complete(7), committing1, committing2]);

		expect(atoms(h12.refs())[0]?.val).toEqual(15);
		expect(atoms(h22.refs())[0]?.val).toEqual(15);
		expect(atoms(h32.refs())[0]?.val).toEqual(15);
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

	it('atoms streamed from commits', async () => {
		const h1 = space.head();
		const c1 = newCommit(h1);

		const h2 = space.head();
		const c2 = newCommit(h2);

		Commit.combine(new MonoidNumber(), [c1, c2]);
		await Promise.all([
			c1.complete(3),
			c2.complete(5),
		]);

		const c3 = newCommit(h1);
		await c3.complete(7);
		
		atom$.complete();
		const refs = await gather(atom$);
		expect(refs.length).toBe(2);
		expect(refs[0].resolve()[0]?.val).toBe(8);
		expect(refs[1].resolve()[0]?.val).toBe(7);
	})

	it('multiple recombinations', async () => {
		const h1 = space.head();
		const c1 = newCommit(h1);

		const h2 = space.head();
		const c2 = newCommit(h2);

		Commit.combine(new MonoidNumber(), [c1, c2]);
		Commit.combine(new MonoidNumber(), [c1, c2]);
		Commit.combine(new MonoidNumber(), [c1, c2]);

		await Promise.all([
			c1.complete(3),
			c2.complete(5),
		]);

		atom$.complete();
		const refs = await gather(atom$);
		expect(refs.length).toBe(1);
		expect(refs[0].resolve()[0]?.val).toBe(8);
	})

	it('accepts extra upstreams', async () => {
		const h1 = space.head();
		const c1 = newCommit(h1);

		const u1 = new Atom(Set(), 3);
		const u2 = new Atom(Set(), 4);

		c1.add(Set([new AtomRef(u1), new AtomRef(u2)]));

		const [h2, a2] = await c1.complete(13);

		expect(atoms(Set([a2]))[0].val)
			.toEqual(13);

		expect(atoms(h2.refs())[0].val)
			.toEqual(13);

		const parents = Set(atoms(h2.refs()))
			.flatMap(r => r.parents);

		expect(atoms(parents)).toContain(u1);
		expect(atoms(parents)).toContain(u2);
	})

	it('upstreams are simplified on addition', async () => {
		const h1 = space.head().write(0);
		const c1 = newCommit(h1);

		const h21 = space.head().write(1);
		c1.add(h21.refs());

		const h22 = h21.write(2);
		c1.add(h22.refs());

		const h23 = h22.write(3);
		c1.add(h23.refs());

		const [h3] = await c1.complete(9);

		const upstreams1 = atoms(h3.refs());
		expect(upstreams1).toHaveLength(1);
		expect(upstreams1.map(a => a.val)).toContain(9);

		const upstreams2 = atoms(Set(upstreams1).flatMap(r => r.parents))
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

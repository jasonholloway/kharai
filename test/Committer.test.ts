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

		await Promise.all([c3.complete(7), committing1, committing2]);
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

	it('heads accept extra upstreams', async () => {
		const h1 = space.head();
		const c1 = newCommit(h1);

		const u1 = new AtomRef(new Atom(Set(), 3));
		const u2 = new AtomRef(new Atom(Set(), 4));

		const h2 = h1.addUpstreams(Set([u1, u2]));

		await c1.complete(1);

		expect(h2.refs()
			.flatMap(r => r.resolve())
			.first(undefined)?.val
			).toEqual(3); //should be checking parentage of otput atom

		throw 'todo!!!'
	})
})

class MonoidNumber implements _Monoid<number> {
  zero: number = 0
	add(a: number, b: number): number {
		return a + b;
  }
}

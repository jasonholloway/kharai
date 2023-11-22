import { describe, expect, it, afterEach } from '@jest/globals';
import Commit from '../src/Committer'
import _Monoid from '../src/_Monoid'
import { delay } from '../src/util'
import { AtomRef, Atom } from '../src/atoms'
import { List, OrderedSet } from 'immutable'
import { Subject } from 'rxjs'
import { Signal } from './MachineSpace'
import Head from '../src/Head'

const atomA = <V>(...rs: AtomRef<V>[]) => rs.flatMap(r => r.resolve());
const valA = <V>(...rs: AtomRef<V>[]) => atomA(...rs).map(a => a.val);

const atomH = <V>(h: Head<V>) => h.refs().flatMap(r => r.resolve()).toArray();
const valH = <V>(h: Head<V>) => atomH(h).map(a => a.val);


describe('committable', () => {
	const commit$ = new Subject();
	let kill$ = new Subject<Signal>();
	const newHead = () => new Head<number>(rs => new Commit(new MonoidNumber(), commit$, rs));

	afterEach(() => {
		kill$.next({ stop: true });
	})

	it('commits singly', async () => {
		const head = newHead();
		expect(atomA(...head.refs())).toEqual([]);

		await head.write(3);

		expect(valH(head)).toEqual([3]);
	})

	it('commits trebly', async () => {
		const h1 = newHead();
		const h2 = newHead();
		const h3 = newHead();

		Commit.conjoin(new MonoidNumber(), [h1.commit(), h2.commit(), h3.commit()]);
		
		const committing1 = h1.write(3);
		await delay(15);
		expect(atomH(h1)).toEqual([]);

		const committing2 = h2.write(5);
		await delay(15);
		expect(atomH(h1)).toEqual([]);
		expect(atomH(h2)).toEqual([]);

		await Promise
			.all([h3.write(7), committing1, committing2]);

		expect(valH(h1)).toEqual([15]);
		expect(valH(h2)).toEqual([15]);
		expect(valH(h3)).toEqual([15]);
	})

	it('commits trebly, in series', async () => {
		const h1 = newHead();
		const h2 = newHead();
		const h3 = newHead();

		Commit.conjoin(new MonoidNumber(), [h1.commit(), h2.commit()]);
		Commit.conjoin(new MonoidNumber(), [h2.commit(), h3.commit()]);
		
		const committing1 = h1.write(3);
		await delay(15);
		expect(atomH(h1)).toEqual([]);

		const committing2 = h2.write(5);
		await delay(15);
		expect(atomH(h1)).toEqual([]);
		expect(atomH(h2)).toEqual([]);

		await Promise
			.all([h3.write(7), committing1, committing2]);

		expect(valH(h1)).toEqual([15]);
		expect(valH(h2)).toEqual([15]);
		expect(valH(h3)).toEqual([15]);
	})

	it('commits twice in one swoop', async () => {
		const h1 = newHead();
		const h2 = newHead();

		Commit.conjoin(new MonoidNumber(), [h1.commit(), h2.commit()]);

		const p1 = h1.write(1);
		const p2 = h2.write(2);
		
		const refs = await Promise.all([p1, p2]);
		expect(refs[0]).toEqual(refs[1]);
	})

	it('completes after all commit', async () => {
		const h1 = newHead();
		const h2 = newHead();

		Commit.conjoin(new MonoidNumber(), [h1.commit(), h2.commit()]);

		let commited1 = false;
		const committing1 = h1.write(3);
		committing1.then(() => commited1 = true);
		await delay(15);
		expect(commited1).toBeFalsy();

		await Promise.all([h2.write(5), committing1]);
		expect(commited1).toBeTruthy();
	})

	it('atoms returned from commits', async () => {
		const h1 = newHead();
		const h2 = newHead();

		Commit.conjoin(new MonoidNumber(), [h1.commit(), h2.commit()]);

		const [a1, a2] = await Promise.all([
			h1.write(3),
			h2.write(5),
		]);

		const a3 = await h1.write(7);
		
		expect(valA(a1)).toEqual([8]);
		expect(valA(a2)).toEqual([8]);
		expect(valA(a3)).toEqual([7]);
	})

	it('multiple recombinations', async () => {
		const h1 = newHead();
		const h2 = newHead();

		Commit.conjoin(new MonoidNumber(), [h1.commit(), h2.commit()]);
		Commit.conjoin(new MonoidNumber(), [h1.commit(), h2.commit()]);
		Commit.conjoin(new MonoidNumber(), [h1.commit(), h2.commit()]);

		const [a1, a2] = await Promise.all([
			h1.write(3),
			h2.write(5),
		]);

		expect(valA(a1)).toEqual([8]);
		expect(valA(a2)).toEqual([8]);
	})

	it('accepts extra upstreams', async () => {
		const h = newHead();

		const u1 = new Atom(List<never>(), 3);
		const u2 = new Atom(List<never>(), 4);

		h.addUpstreams(OrderedSet([new AtomRef(u1), new AtomRef(u2)]));

		const a2 = await h.write(13);

		expect(valA(a2)).toEqual([13]);
		expect(valH(h)).toEqual([13]);

		const parents = List(atomH(h))
			.flatMap(r => r.parents);

		expect(atomA(...parents)).toContain(u1);
		expect(atomA(...parents)).toContain(u2);
	})

	it('upstreams are simplified on addition', async () => {
		const h1 = newHead();
		await h1.write(0);

		const h2 = newHead();
		await h2.write(1);
		h1.addUpstreams(h2.refs());

		await h2.write(2);
		h1.addUpstreams(h2.refs());

		await h2.write(3);
		h1.addUpstreams(h2.refs());

		await h1.write(9);

		const upstreams1 = atomH(h1);
		expect(upstreams1).toHaveLength(1);
		expect(upstreams1.map(a => a.val)).toContain(9);

		const upstreams2 = atomA(...List(upstreams1).flatMap(r => r.parents))
		expect(upstreams2).toHaveLength(2);
		expect(upstreams2.map(a => a.val)).toContain(0);
		expect(upstreams2.map(a => a.val)).toContain(3);
	})

	it('abort releases, causing others to error', async () => {
		expect.assertions(2);

		const h1 = newHead();
		const h2 = newHead();
		const h3 = newHead();

		await h1.write(1);
		await h2.write(2);
		await h3.write(3);

		Commit.conjoin(new MonoidNumber(), [h1.commit(), h2.commit(), h3.commit()]);

		const p1 = h1.write(1).catch(e => {
			expect(e).toEqual('Commit aborted!')
		});

		h3.reset();
		
		const p2 = h2.write(2).catch(e => {
			expect(e).toEqual('Commit aborted!')
		});

		await Promise.all([p1, p2]);
	})
})

class MonoidNumber implements _Monoid<number> {
  zero: number = 0
	add(a: number, b: number): number {
		return a + b;
  }
}

//there's a problem here:
//what to do when one party completes before others are added?
//it seems that a 'doing' commit should be combinable with a 'done'
//one
//
//extending the commit when it's already yielded a ref for some happy head
//just can't work - 
//
//

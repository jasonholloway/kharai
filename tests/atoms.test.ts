import { List } from 'immutable'
import { delay } from './helpers'
import _Monoid from '../src/_Monoid'
import { Saver } from '../src/Store'
import { Atom, AtomRef } from '../src/atoms'
import AtomSpace from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Subject, Observer } from 'rxjs'
import { Signal } from '../src/MachineSpace'
import { concatMap, tap, map } from 'rxjs/operators'
import { tracePath } from '../src/AtomPath'
import { viewAtoms } from './shared'
import Head from '../src/Head'

const MU: _Monoid<undefined> = {
	zero: undefined,
	add: () => undefined
}

const MS: _Monoid<string> = {
  zero: '',
	add(a, b) {
		return a + b;
  }
}

const MMax: _Monoid<number> = {
  zero: 0,
	add(a, b) {
		return a > b ? a : b;
  }
}

const newHead = (sink?: Observer<[number, AtomRef<string>]>) => new Head<string>(sink ?? new Subject(), List());

describe('atoms and stuff', () => {

	let store: FakeStore
	let space: AtomSpace<string>
	let saver: AtomSaver<string>
	let kill: () => void

	beforeEach(() => {
		const killSub = new Subject<Signal>()
		kill = () => killSub.next({ stop: true });
		
		store = new FakeStore(3);
		space = new AtomSpace();
		saver = new AtomSaver(MS, space);
	})

	it('pristine head has no atom', () => {
		const head = newHead();
		expect(head.refs().toArray()).toEqual([]);
	})

	it('writing creates atom', () => {
		const head = newHead();
		head.write('1');

		const [atom] = viewAtoms(head.refs())
		expect(atom).not.toBeUndefined();
		expect(atom.val()).toBe('1');
		expect(atom.parents()).toEqual([]);
	})

	it('writing several times appends many atoms', async () => {
		const head = newHead();
		head.write('1')
		head.write('2')
		head.write('3');

		const [atom3] = viewAtoms(head.refs());
		expect(atom3?.val()).toBe('3');

		const [atom2] = atom3.parents();
		expect(atom2?.val()).toBe('2');
		
		const [atom1] = atom2.parents();
		expect(atom1?.val()).toBe('1');

		expect(atom1?.parents()).toEqual([]);
	})

	it('like-for-like rewrite', async () => {
		const head = newHead();
		head.write('1');
		head.write('2');
		head.write('3');

		const path = await space.lockPath(...head.refs());
		expect(path.maxDepth()).toBe(3)

		const before = path.path().render()

		path.rewrite(fn => ([ref, atom]) => {
			const [,newParents] = fn(atom.parents);
			return [,[[ref], new Atom(newParents, atom.val).asRef()]]
		}, MU).complete();

		const after = path.path().render()
		expect(after).toEqual(before)
	})

	it('two heads rewrite', async () => {
		const head1 = newHead();
		head1.write('1:1');

		const head2 = head1.fork();
		head2.write('2:1');

		head1.write('1:2');

		const path1 = await space.lockPath(...head1.refs());
		expect(path1.maxDepth()).toBe(2)

		const before = path1.path().render()

		path1.rewrite(fn => ([ref, atom]) => {
			const [,newParents] = fn(atom.parents)
			return [,[[ref], new Atom(newParents, atom.val).asRef()]]
		}, MU).complete();

		path1.release();

		const after1 = path1.path().render()
		expect(after1).toEqual(before)

		const path2 = await space.lockPath(...head2.refs());
		const after2 = path2.path().render();
	})

	it('upstream joins visited once only', async () => {
		const ref1 = new AtomRef(new Atom(List(), 'a0'));
		const ref2 = new AtomRef(new Atom(List([ref1]), 'b1'));
		const ref3 = new AtomRef(new Atom(List([ref1]), 'B2'));
		const ref4 = new AtomRef(new Atom(List([ref2, ref3]), 'c3'));

		const path = await space.lockPath(ref4);
		const before = path.path().render();

		let i = 0;
		path.rewrite(fn => ([ref, atom]) => {
			const [,upstreams] = fn(atom.parents);
			return [,[[ref], new Atom(upstreams, atom.val.slice(0, 1) + (i++)).asRef()]];
		}, MU).complete();
		path.release();
		const after = path.path().render();

		expect(after).toEqual(before);
	})

	it('paths can have multiple tips', async () => {
		const ref1 = new AtomRef(new Atom(List(), 'a0'));
		const ref2 = new AtomRef(new Atom(List([ref1]), 'b1'));
		const ref3 = new AtomRef(new Atom(List([ref1]), 'c2'));

		const path = await space.lockPath(ref2, ref3);

		let i = 0;
		path.rewrite(fn => ([ref, atom]) => {
			const [,ups] = fn(atom.parents);
			return [,[[ref], new Atom(ups, atom.val.slice(0, 1).toUpperCase() + (i++)).asRef()]];
		}, MU).complete();
		path.release();

		const after = path.path().render();

		expect(after).toEqual([
			[
				[
					[ [], 'A0' ]
				],
				'B1'
			],
			[
				[
					[ [], 'A0' ]
				],
				'C2'
			]
		]);
	})
	
	it('locking', async () => {
		const head1 = newHead();
		head1.write('1:1');

		const head2 = head1.fork();
		head2.write('2:1');

		head1.write('1:2');

		const path1 = await space.lockPath(...head1.refs());

		let locked2 = false;
		space.lockPath(...head2.refs()).then(() => locked2 = true);

		await delay(100);
		expect(locked2).toBeFalsy();

		path1.release();
		await delay(0);
		expect(locked2).toBeTruthy();
	})

	it('path -> patch -> path lock', async () => {
		const head1 = newHead();
		head1.write('1:1');

		const head2 = head1.fork();
		head2.write('2:1');

		head1.write('1:2');

		const path = await space.lockPath(...head1.refs());

		let head2Activated = false;
		space.lockPath(...head2.refs()).then(() => head2Activated = true);

		await delay(50);
		expect(head2Activated).toBeFalsy();

		path.rewrite(visit => ([ref, atom]) => {
			const [,parents] = visit(atom.parents);
			return [,[[ref], new Atom(parents, atom.val).asRef()]]
		},MU).complete(); 

		await delay(50);
		expect(head2Activated).toBeFalsy();

		path.release();
		await delay(50);
		expect(head2Activated).toBeTruthy();
	})

	it('saving simple combination', async () => {
		const head = newHead();
		head.write('1');
		head.write('2');
		head.write('3');

		await saver.save(store, head.refs());

		expect(store.saved).toEqual(['123']);
	});

	it('saving in multiple transactions', async () => {
		const head = newHead();
		head.write('1');
		head.write('2');
		head.write('3');
		head.write('4');
		head.write('5');

		await saver.save(store, head.refs());
		await saver.save(store, head.refs());

		expect(store.saved).toEqual(['123', '45']);
	});

	it('locking tips gets latest roots', async () => {
		const head = newHead();
		head.write('0');

		const refs = head.refs();

		const locking1 = space.lockPath(...refs);
		const locking2 = space.lockPath(...refs);

		const path1 = await locking1;

		path1.rewrite(_ => ([ref]) => {
			return [,[[ref], new Atom(List(), '1').asRef()]];
		}, MU).complete();
		
		path1.release();

		await delay(50);

		let locked3 = false;
		const locking3 = space.lockPath(...refs);
		locking3.then(() => locked3 = true);

		await delay(50);
		expect(locked3).toBeFalsy();

		const path2 = await locking2;
		path2.release();

		await delay(50);

		expect(locked3).toBeTruthy();
	});

	describe('locking on top of taken', () => {

		it('with lock held', async () => {

			const h1 = newHead();
			h1.write('a');
			h1.write('b');

			const p1 = await space.lockPath(...h1.refs());
			p1.rewrite<1>(fn => ([ref, atom]) => {
				fn(atom.parents);
				return [1, [[ref], atom.with({ state: 'taken' })]];
			}, M1).complete();

			expect(tracePath(p1.tips))
				.toStrictEqual([
					['b', [
						['a', []]
					]]
				]);

			//and can lock above here happy enough
			h1.write('c');
			h1.write('d');
			h1.write('e');

			const p2 = await space.lockPath(...h1.refs());

			expect(tracePath(p2.tips))
				.toStrictEqual([
					['e', [
						['d', [
							['c', [
								['b', [
									['a', []]
								]]
							]]
						]]
					]]
				]);

			p1.release();
			p2.release();

			kill();
		});

		it('with lock released', async () => {

			const h1 = newHead();
			h1.write('a');
			h1.write('b');

			const p1 = await space.lockPath(...h1.refs());
			p1.rewrite<1>(fn => ([ref, atom]) => {
				fn(atom.parents);
				return [1, [[ref], atom.with({ state: 'taken' })]];
			}, M1).complete();

			expect(tracePath(p1.tips))
				.toStrictEqual([
					['b', [
						['a', []]
					]]
				]);

			p1.release();

			//and can lock above here happy enough
			h1.write('c');
			h1.write('d');
			h1.write('e');

			const p2 = await space.lockPath(...h1.refs());

			expect(tracePath(p2.tips))
				.toStrictEqual([
					['e', [
						['d', [
							['c', [
								['b', [
									['a', []]
								]]
							]]
						]]
					]]
				]);

			p2.release();

			kill();
		});

		it('rewrite only touches locked path', async () => {

			const h1 = newHead();
			h1.write('a');
			h1.write('b');

			const p1 = await space.lockPath(...h1.refs());
			p1.rewrite<1>(fn => ([ref, atom]) => {
				fn(atom.parents);
				return [1, [[ref], atom.with({ state: 'taken' })]];
			}, M1).complete();

			expect(tracePath(p1.tips))
				.toStrictEqual([
					['b', [
						['a', []]
					]]
				]);

			//and can lock above here happy enough
			h1.write('c');
			h1.write('d');
			h1.write('e');

			const p2 = await space.lockPath(...h1.refs());

			const ac = p2.rewrite<string>(
				fn => ([ref, atom]) => {
					const [s, parents] = fn(atom.parents);
					return [s + atom.val, [[ref], atom.with({ parents })]];
				}, MS).complete();

			expect(ac).toBe('cde');

			expect(tracePath(p2.tips))
				.toStrictEqual([
					['e', [
						['d', [
							['c', [
								['b', [
									['a', []]
								]]
							]]
						]]
					]]
				]);

			p1.release();
			p2.release();

			kill();
		});

	})

	const M1: _Monoid<1> = {
		zero: 1,
		add: () => 1
	}

	describe('rewriting', () => {
		it('can rewrite', async () => {
			const c = [0, 0, 0];
			const sink$ = new Subject<[number, AtomRef<string>]>()
			const atom$ = sink$.pipe(map(([,r]) => r));

			atom$.pipe(
				concatMap(r => space.lockPath(r)),
				tap(path => {
					try {
						path.rewrite<1>(_ => ([ref, atom]) => {
							c[0]++;
							return [1, [[ref], atom.with({ val: atom.val.toUpperCase() })]]; 
						}, M1).complete();
					}
					finally {
						path.release();
					}
				})
			).subscribe();

			atom$.pipe(
				concatMap(r => space.lockPath(r)),
				tap(path => {
					try {
						path.rewrite<1>(_ => ([ref, atom]) => {
							c[1]++;
							return [1, [[ref], atom.with({ val: atom.val + atom.val })]]; 
						}, M1).complete();
					}
					finally {
						path.release();
					}
				})
			).subscribe();

			atom$.pipe(
				concatMap(r => space.lockPath(r)),
				tap(path => {
					try {
						path.rewrite<number>(fn => ([ref, atom]) => {
							c[2]++;
							const [ac, parents] = fn(atom.parents);
							const ac2 = ac + 1;
							return [ac2, [[ref], atom.with({ val: atom.val + ac2, parents })]]; 
						}, MMax).complete();
					}
					finally {
						path.release();
					}
				})
			).subscribe();
			
			const h1 = newHead(sink$);
			h1.write('a');
			h1.write('b');
			h1.write('c');

			await delay(500);
			kill();

			// renderAtoms(h1.refs());

			expect(c[0]).toBe(1 + 1 + 1);
			expect(c[1]).toBe(1 + 1 + 1);
			expect(c[2]).toBe(1 + 2 + 3);

			expect(tracePath(h1.refs()))
				.toStrictEqual([
					['C3C3', [
						['BB22', [
							['AA111', [
							]]
						]]
					]]
				]);
		})
		
	})
});


//---------------------------------

class FakeStore implements Saver<string> {
	saved: string[] = []
	private _maxBatch: number;
	private _delay: number;

	constructor(batchSize: number, delay: number = 15) {
		this._maxBatch = batchSize;
		this._delay = delay;
	}

	prepare(v: string): {save():Promise<void>}|false {
		return (v.length <= this._maxBatch)
			&& {
				save: () => {
					this.saved.push(v);
					return delay(this._delay);
				}
			};
	}
}


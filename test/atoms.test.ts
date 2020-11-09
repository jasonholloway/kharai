import { Map, Set } from 'immutable'
import { delay } from './helpers'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import { Atom, AtomRef } from '../src/atoms'
import AtomSpace from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'

const getAtoms = <V>(rs: Set<AtomRef<V>>) => rs.flatMap(r => r.resolve())

describe('atoms and stuff', () => {

	let store: FakeStore
	let space: AtomSpace<string>
	let saver: AtomSaver<string>

	beforeEach(() => {
		store = new FakeStore(new MonoidString(), 3);
		space = new AtomSpace();
		saver = new AtomSaver(new MonoidString(), space);
	})

	it('pristine head has no atom', () => {
		const head = space.head();
		expect(head.refs().toArray()).toEqual([]);
	})

	it('writing creates atom', () => {
		const head = space.head()
		  .write('1');
		
		const [atom] = getAtoms(head.refs())
		expect(atom).not.toBeUndefined();
		expect(atom?.val).toBe('1');
		expect(getAtoms(atom?.parents).toArray()).toEqual([]);
	})

	it('writing several times appends many atoms', async () => {
		const head = space.head()
		  .write('1')
			.write('2')
			.write('3');

		const [atom3] = getAtoms(head.refs());
		expect(atom3?.val).toBe('3');

		const [atom2] = getAtoms(atom3.parents);
		expect(atom2?.val).toBe('2');
		
		const [atom1] = getAtoms(atom2.parents);
		expect(atom1?.val).toBe('1');

		expect(getAtoms(atom1?.parents).toArray()).toEqual([]);
	})

	it('like-for-like rewrite', async () => {
		const head = space.head()
		  .write('1')
			.write('2')
			.write('3');

		const path = await space.lockTips(...head.refs());
		expect(path.maxDepth()).toBe(3)

		const before = path.path().render()

		path.rewrite(fn => (ref, atom) => {
			const newParents = atom.parents.map(fn)
			return [[ref], new Atom(newParents, atom.val)]
		}).complete();

		const after = path.path().render()
		expect(after).toEqual(before)
	})

	it('two heads rewrite', async () => {
		const head11 = space.head()
			.write('1:1');

		const head21 = head11
			.write('2:1');

		const head12 = head11
		  .write('1:2');

		const path1 = await space.lockTips(...head12.refs());
		expect(path1.maxDepth()).toBe(2)

		const before = path1.path().render()

		path1.rewrite(fn => (ref, atom) => {
			const newParents = atom.parents.map(fn)
			return [[ref], new Atom(newParents, atom.val)]
		}).complete();

		path1.release();

		const after1 = path1.path().render()
		expect(after1).toEqual(before)

		const path2 = await space.lockTips(...head21.refs());
		const after2 = path2.path().render();
	})

	it('upstream joins visited once only', async () => {
		const ref1 = new AtomRef(new Atom(Set(), 'a0'));
		const ref2 = new AtomRef(new Atom(Set([ref1]), 'b1'));
		const ref3 = new AtomRef(new Atom(Set([ref1]), 'B2'));
		const ref4 = new AtomRef(new Atom(Set([ref2, ref3]), 'c3'));

		const path = await space.lockTips(ref4);
		const before = path.path().render();

		let i = 0;
		path.rewrite(fn => (ref, atom) => {
			const upstreams = atom.parents.map(fn);
			return [[ref], new Atom(upstreams, atom.val.slice(0, 1) + (i++))];
		}).complete();
		path.release();
		const after = path.path().render();

		expect(after).toEqual(before);
	})

	it('paths can have multiple tips', async () => {
		const ref1 = new AtomRef(new Atom(Set(), 'a0'));
		const ref2 = new AtomRef(new Atom(Set([ref1]), 'b1'));
		const ref3 = new AtomRef(new Atom(Set([ref1]), 'c2'));

		const path = await space.lockTips(ref2, ref3);

		let i = 0;
		path.rewrite(fn => (ref, atom) => {
			const ups = atom.parents.map(fn);
			return [[ref], new Atom(ups, atom.val.slice(0, 1).toUpperCase() + (i++))];
		}).complete();
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
		const head11 = space.head()
			.write('1:1');

		const head2 = head11
			.write('2:1');

		const head12 = head11
			.write('1:2');

		const path1 = await space.lockTips(...head12.refs());

		let locked2 = false;
		space.lockTips(...head2.refs()).then(() => locked2 = true);

		await delay(100);
		expect(locked2).toBeFalsy();

		path1.release();
		await delay(0);
		expect(locked2).toBeTruthy();
	})

	it('path -> patch -> path lock', async () => {
		const head11 = space.head()
			.write('1:1');

		const head2 = head11
			.write('2:1');

		const head12 = head11
			.write('1:2');

		const path = await space.lockTips(...head12.refs());

		let head2Activated = false;
		space.lockTips(...head2.refs()).then(() => head2Activated = true);

		await delay(50);
		expect(head2Activated).toBeFalsy();

		path.rewrite(visit => (ref, atom) => {
			const parents = atom.parents.map(visit)
			return [[ref], new Atom(parents, atom.val)]
		}).complete(); 

		await delay(50);
		expect(head2Activated).toBeFalsy();

		path.release();
		await delay(50);
		expect(head2Activated).toBeTruthy();
	})

	it('saving simple combination', async () => {
		const head = space.head()
			.write('1')
			.write('2')
			.write('3');

		await saver.save(store, Set([head]));

		expect(store.saved).toEqual(['123']);
	});

	it('saving in multiple transactions', async () => {
		const head = space.head()
			.write('1')
			.write('2')
			.write('3')
			.write('4')
			.write('5');

		await saver.save(store, Set([head]));

		expect(store.saved).toEqual(['123', '45']);
	});

	it('locking tips gets latest roots', async () => {
		const head = space.head()
			.write('0');

		const refs = head.refs();

		const locking1 = space.lockTips(...refs);
		const locking2 = space.lockTips(...refs);

		const path1 = await locking1;

		path1.rewrite(_ => (ref, _) => {
			return [[ref], new Atom(Set(), '1')];
		}).complete();
		
		path1.release();

		await delay(50);

		let locked3 = false;
		const locking3 = space.lockTips(...refs);
		locking3.then(() => locked3 = true);

		await delay(50);
		expect(locked3).toBeFalsy();

		const path2 = await locking2;
		path2.release();

		await delay(50);

		expect(locked3).toBeTruthy();
	});
});


//---------------------------------

type Table<V> = Map<string, V>

class MonoidTable<V> implements _Monoid<Table<V>> {
  zero: Table<V> = Map()
	add(a: Table<V>, b: Table<V>): Table<V> {
		return a.merge(b);
  }
}

class MonoidString implements _Monoid<string> {
  zero: string = ''
	add(a: string, b: string): string {
		return a + b;
  }
}

//---------------------------------

class FakeStore extends Store<string> {
	saved: string[] = []
	private _maxBatch: number;

	constructor(monoid: _Monoid<string>, batchSize: number) {
		super(monoid);
		this._maxBatch = batchSize;
	}

	prepare(v: string): {save():Promise<void>}|false {
		return (v.length <= this._maxBatch)
			&& {
				save: () => {
					this.saved.push(v);
					return Promise.resolve();
				}
			};
	}
}


import { inspect } from 'util'
import { Map, Set } from 'immutable'
import { delay } from './helpers'
import Locks, { Lock } from '../src/Locks'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'

const lift = <V>(v: V|undefined) => (v ? [v] : []);

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
		const head = space.spawnHead();
		const atom = head.ref().resolve();
		expect(atom).toBeUndefined();
	})

	it('committing creates atom', () => {
		const head = space.spawnHead()
		head.commit('1');
		
		const atom = head.ref().resolve();
		expect(atom).not.toBeUndefined();
		expect(atom?.val).toBe('1');
		expect(atom?.parents.size).toBe(1);
		expect(atom?.parents.first(undefined)?.resolve()).toBeUndefined();
	})

	it('committing several times appends many atoms', async () => {
		const head = space.spawnHead();
		head.commit('1');
		head.commit('2');
		head.commit('3');

		const atom3 = head.ref().resolve();
		expect(atom3?.val).toBe('3');

		const atom2 = atom3?.parents.first(undefined)?.resolve();
		expect(atom2?.val).toBe('2');
		
		const atom1 = atom2?.parents.first(undefined)?.resolve();
		expect(atom1?.val).toBe('1');

		expect(atom1?.parents.size).toBe(1);
		expect(atom1?.parents.first(undefined)?.resolve()).toBeUndefined();
	})

	it('like-for-like rewrite', async () => {
		const head = space.spawnHead();
		head.commit('1');
		head.commit('2');
		head.commit('3');

		const path = await space.lockTips(head.ref());
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
		const head1 = space.spawnHead();
		
		head1.commit('1:1');

		const head2 = head1.spawnHead();
		
		head1.commit('1:2');
		head2.commit('2:1');

		const path1 = await space.lockTips(head1.ref());
		expect(path1.maxDepth()).toBe(2)

		const before = path1.path().render()

		path1.rewrite(fn => (ref, atom) => {
			const newParents = atom.parents.map(fn)
			return [[ref], new Atom(newParents, atom.val)]
		}).complete();

		path1.release();

		const after1 = path1.path().render()
		expect(after1).toEqual(before)

		const path2 = await space.lockTips(head2.ref());
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
		const head1 = space.spawnHead();
		head1.commit('1:1');

		const head2 = head1.spawnHead();
		head2.commit('2:1');

		head1.commit('1:2');

		const path1 = await space.lockTips(head1.ref());

		let locked2 = false;
		space.lockTips(head2.ref()).then(() => locked2 = true);

		await delay(100);
		expect(locked2).toBeFalsy();

		path1.release();
		await delay(0);
		expect(locked2).toBeTruthy();
	})

	it('path -> patch -> path lock', async () => {
		const head1 = space.spawnHead();
		head1.commit('1:1');

		const head2 = head1.spawnHead();
		head2.commit('2:1');

		head1.commit('1:2');

		const path = await space.lockTips(head1.ref());

		let head2Activated = false;
		space.lockTips(head2.ref()).then(() => head2Activated = true);

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
		const head = space.spawnHead();
		head.commit('1');
		head.commit('2');
		head.commit('3');

		await saver.save(store, Set([head]));

		expect(store.saved).toEqual(['123']);
	});

	it('saving in multiple transactions', async () => {
		const head = space.spawnHead();
		head.commit('1');
		head.commit('2');
		head.commit('3');
		head.commit('4');
		head.commit('5');

		await saver.save(store, Set([head]));

		expect(store.saved).toEqual(['123', '45']);
	});
});


type AtomVisitor<V> = (ref: AtomRef<V>, atom: Atom<V>) => readonly [AtomRef<V>[], Atom<V>|null]

type AtomPatch = { complete(): void }

class AtomSaver<V> {
	private _monoidV: _Monoid<V>;
	private _space: AtomSpace<V>;
	
	constructor(monoidV: _Monoid<V>, space: AtomSpace<V>) {
		this._monoidV = monoidV;
		this._space = space;
	}

	async save(store: Store<V>, heads: Set<Head<V>>): Promise<void> {
		const M = this._monoidV;

		const path = await this._space.lockTips(...heads.map(h => h.ref()));
		//after getting the lock, we should ensure the roots are still the roots...
		//should this be done as part of lockTips?

		try {
			while(path.hasAtoms()) {
				let mode: 'gather'|'copy' = 'gather';
				let bagged = M.zero;
				let save = () => Promise.resolve();

				const patch = path.rewrite(fn => (ref, atom) => {
					const parents = atom.parents.map(fn);
					switch(mode) {
						case 'gather':
							const upstreamCombo = M.add(
								bagged,
								parents
									.map(ref => ref.resolve()?.val || M.zero)
									.reduce(M.add, M.zero)
							);
							const canSave1 = store.prepare(upstreamCombo);
							if(canSave1) {
								bagged = upstreamCombo;
								save = () => canSave1.save();
							}
							else {
								mode = 'copy'
								return [[ref], new Atom(parents, atom.val)];
							}

							const combo = M.add(bagged, atom.val);
							const canSave2 = store.prepare(combo);
							if(canSave2) {
								bagged = combo;
								save = () => canSave2.save();
								return [[...parents, ref], null];
							}
							else {
								mode = 'copy'
								return [[...parents, ref], new Atom(Set(), atom.val)];
							}

						case 'copy':
							return [[ref], new Atom(parents, atom.val)];
					}
				});

				await save();

				patch.complete();
			}
		}
		finally {
			path.release();
		}

		//plus we could 'top up' our current transaction till full here
		//by taking latest refs from head
		//...
	}
}

class AtomSpace<V> {
	private _locks: Locks = new Locks();
	private _heads: Set<Head<V>> = Set();

	lock<V>(atoms: Set<Atom<V>>): Promise<Lock> {
		return this._locks.lock(...atoms);
	}

	spawnHead(ref?: AtomRef<V>): Head<V> {
		const head = new Head(this, ref || new AtomRef());
		this._heads = this._heads.add(head);
		return head;
	}

	async lockTips(...tips: AtomRef<V>[]): Promise<AtomPath<V>> {
		const roots = Set(tips).flatMap(AtomPath.findRoots);
		const lock = await this.lock(roots);
		return new AtomPath(tips, lock);
	}
}



class AtomPath<V> {
	private readonly _tips: Set<AtomRef<V>>
	private readonly _lock: Lock

	constructor(tips: AtomRef<V>[], lock: Lock) {
		this._tips = Set(tips);
		this._lock = lock;
	}

	release() {
		this._lock.release();
	}

	maxDepth(): number {
		const plumbDepth = (refs: Set<AtomRef<V>>, d: number): Set<number> =>
			refs
				.flatMap(r => lift(r.resolve()))
				.flatMap(a => plumbDepth(a.parents, d + 1))
				.concat([d]);

		return plumbDepth(this._tips, 0).max() || 0;
	}

	hasAtoms(): boolean {
		return this._tips.some(r => !!r.resolve());
	}	

	rewrite(fn: (self: (a: AtomRef<V>) => AtomRef<V>) => AtomVisitor<V>): AtomPatch {
		let redirects = Map<AtomRef<V>, AtomRef<V>>();

		const visitor: AtomVisitor<V> = fn(ref => {
			return redirects.get(ref) || (() => {
				const atom = ref.resolve();
				if(!atom) return ref;
				else {
					const [sources, newAtom] = visitor(ref, atom);
					const newRef = new AtomRef(newAtom);

					redirects = redirects.merge(Set(sources).map(r => [r, newRef]));

					return newRef;
				}
			})();
		});

		const newRefs = this._tips.flatMap(ref => {
			const atom = ref.resolve();
			if(atom) {
				const [sources, newAtom] = visitor(ref, atom);
				const newRef = new AtomRef(newAtom);

				redirects = redirects.merge(Set(sources).map(r => [r, newRef]));

				return [newRef];
			}
			else {
				return [];
			}
		})

		return {
			complete: () => {
				for (const [from, to] of redirects) {
						from.redirect(to);
				}

				//but in saving, don't we remove all atoms, leaving nothing to be locked?
				//it does indeed seem like we need something to lock...
				//
				//******
				//in rewriting, we need to leave a single empty atom rooting every head

				//otherwise other rewrites can be done
				//a saved head is unlocked; can quickly add a new atom and save it
				//but if there isn't a root there, there's nothing to worry about: no contention because no data
				//any other atoms still to be saved will be necessarily rooted still
				//******

				const newRoots = newRefs.flatMap(AtomPath.findRoots);
				this._lock.extend(newRoots);
			}
		};
	}

	path(): Path<V> {
		const _map = (ref: AtomRef<V>): Set<PathNode<V>> => {
			const atom = ref.resolve()
			if(!atom) return Set();

			const parents = atom?.parents.flatMap(_map)
			return Set([new PathNode(parents, atom.val)])
		}
		
		return new Path(this._tips.flatMap(_map));
	}

	static findRoots<V>(ref: AtomRef<V>): Set<Atom<V>> {
		const atom = ref.resolve();
		if(!atom) return Set();
		else {
			const above = atom.parents.flatMap(AtomPath.findRoots);
			return above.isEmpty() ? Set([atom]) : above;
		}
	}
}


class Head<V> {
	private _space: AtomSpace<V>
	private _ref: AtomRef<V>

	constructor(space: AtomSpace<V>, ref: AtomRef<V>) {
		this._space = space;
		this._ref = ref;
	}

	commit(val: V) {
		this._ref = new AtomRef(new Atom(Set([this._ref]), val));
	}

	spawnHead(): Head<V> {
		return this._space.spawnHead(this._ref);
	}

	ref() {
		return this._ref;
	}
}



type AtomTarget<V> = Atom<V> | AtomRef<V> | null;

class AtomRef<V> {
	readonly _type = 'AtomRef'
  private _target: AtomTarget<V>

	constructor(target?: AtomTarget<V>) {
		this._target = target || null;
	}

	redirect(target: AtomTarget<V>) {
		this._target = target;
	} 
	
	resolve(): Atom<V>|undefined {
		const t = this._target;
		if(t) {
			switch(t._type) {
				case 'Atom': return t;
				case 'AtomRef': return t.resolve();
			}
		}
	}
}

class Atom<V> {
	readonly _type = 'Atom'
	readonly parents: Set<AtomRef<V>>
	readonly val: V

	constructor(parents: Set<AtomRef<V>>, val: V) {
		this.parents = parents;
		this.val = val;
	}
}



class Path<V> {
	readonly nodes: Set<PathNode<V>>

	constructor(nodes: Set<PathNode<V>>) {
		this.nodes = nodes;
	}

	map<Y>(fn: (v:V) => Y): Path<Y> {
		return new Path(this.nodes.map(n => n.map(fn)))
	}

	render() {
		return this.nodes.map(n => n.render()).toArray()
	}
}

class PathNode<V> {
	readonly parents: Set<PathNode<V>>
	readonly value: V

	constructor(parents: Set<PathNode<V>>, val: V) {
		this.parents = parents;
		this.value = val;
	}

	map<Y>(fn: (v: V) => Y): PathNode<Y> {
		const parents = this.parents.map(p => p.map(fn))
		return new PathNode(parents, fn(this.value))
	}

	render(): any {
		return [[...this.parents.map(p => p.render())], this.value];
	}
}


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

class MonoidArray<V> implements _Monoid<V[]> {
	zero = []
	add(a: V[], b: V[]) {
		return [...a, ...b];
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
		return v.length <= this._maxBatch
			&& {
				save: () => {
					this.saved.push(v);
					return Promise.resolve();
				}
			};
	}
}


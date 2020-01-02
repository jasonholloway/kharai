import { inspect } from 'util'
import { Map, Set, List } from 'immutable'
import { delay } from './helpers'
import Locks, { Lock } from '../src/Locks'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'

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

		const path = await space.lockPath(head.ref());
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

		const path1 = await space.lockPath(head1.ref());
		expect(path1.maxDepth()).toBe(2)

		const before = path1.path().render()

		path1.rewrite(fn => (ref, atom) => {
			const newParents = atom.parents.map(fn)
			return [[ref], new Atom(newParents, atom.val)]
		}).complete();

		path1.release();

		const after1 = path1.path().render()
		expect(after1).toEqual(before)

		const path2 = await space.lockPath(head2.ref());
		const after2 = path2.path().render();

		console.log('after1', inspect(after1, { depth: 5 }));
		console.log('after2', inspect(after2, { depth: 5 }));
	})

	it('upstream joins visited once only', async () => {
		const ref1 = new AtomRef(new Atom(Set(), 'a0'));
		const ref2 = new AtomRef(new Atom(Set([ref1]), 'b1'));
		const ref3 = new AtomRef(new Atom(Set([ref1]), 'B2'));
		const ref4 = new AtomRef(new Atom(Set([ref2, ref3]), 'c3'));

		const path = await space.lockPath(ref4);
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

		const path = await space.lockPath(ref2, ref3);
		
		//TODO
		throw 'TODO!!!!!'
	})

	it('locking', async () => {
		const head1 = space.spawnHead();
		head1.commit('1:1');

		const head2 = head1.spawnHead();
		head2.commit('2:1');

		head1.commit('1:2');

		const path1 = await space.lockPath(head1.ref());

		let locked2 = false;
		space.lockPath(head2.ref()).then(() => locked2 = true);

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

		const path = await space.lockPath(head1.ref());

		let head2Activated = false;
		space.lockPath(head2.ref()).then(() => head2Activated = true);

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

		await saver.save(store, Set([head]));

		expect(store.saved).toEqual(['123', '4']);
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
		const headRefs = heads.map(h => h.ref());

		let bagged = M.zero;
		let save = () => Promise.resolve();

		// while(headRefs.some(r => !!r.resolve())) {
			//now gather forwards - but if we were to save multiple heads at once, we'd need to secure multiple paths concurrently
			//lockPath would take multiple tips, would rewrite multiple paths

			//a problem with the current lockPath impl is that if two paths of rewriting were to reference a single root (part-root)
			//the separate rewritings would have no way to see each other
			//because the initial 'touch' of that ref wouldn't actually be carried through till the whole rewriting was done
			//we need some kind of facade AtomRef

			//this is absolutely true though: if we want to save multiple heads into one (as we will certainly want to do in saving /everything/ at the end)
			//there needs to be some way of rewriting multiple paths as one, in some jquery-like implicit acceptance of multiplicity
			//the existing appraoch can be neatly adapted but we need this updating of partially rewritten refs

			//an idea: refs are updated eagerly, with handles for rollback on the ref level
			//but between rewriting and asynchronous saving, these eager changes will appear elsewhere to
			//root locks should prevent other changes to them, but we expect them to be readable whenever

			//refs could always be resolved in some context
			//or rather, resolution has an optional remapping that can be passed in
			//or better, resolution could be done /via/ something: whatever it is doing the resolving of references should always resolve via a remapping context
			//...
		// }
		

		for(const headRef of headRefs) {


			

			// while(headRef.resolve()) {
			// 	//BUT! head is mutable here
			// 	//to do this, head must be an immutable value
			// }

			//but whatever it is doing the gathering here wants to /take/ what it can
			//we keep on taking reductions of the headRefs till 
			//all headRefs point to null

			//two separable concerns
			//we gather forwards, across heads
			//
			
			
			const path = await this._space.lockPath(headRef);
			try {
				let mode: 'gather'|'copy' = 'gather';
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
			finally {
				path.release();
			}
			//more to do here around retries
			//eg what if we don't get to end of head in one save?
		}
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

	async lockPath(tip: AtomRef<V>): Promise<AtomPath<V>> {
		const roots = AtomPath.findRoots(tip);
		const lock = await this.lock(roots);
		return new AtomPath(tip, lock);
	}
}

class AtomPath<V> {
	private readonly _tip: AtomRef<V>
	private readonly _lock: Lock

	constructor(tip: AtomRef<V>, lock: Lock) {
		this._tip = tip;
		this._lock = lock;
	}

	release() {
		this._lock.release();
	}

	maxDepth(): number {
		const plumbDepth = (ref: AtomRef<V>, d: number): number => {
			const atom = ref.resolve();
			return atom
				? (atom.parents
						.map(p => plumbDepth(p, d + 1))
						.max() || (d + 1))
				: d;
		}

		return plumbDepth(this._tip, 0);
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

		const atom = this._tip.resolve();
		if(!atom) return { complete() {} };
		else {
			const [sources, newAtom] = visitor(this._tip, atom);
			const newRef = new AtomRef(newAtom);

			redirects = redirects.merge(Set(sources).map(r => [r, newRef]));

			return {
					complete: () => {
						for (let [from, to] of redirects) {
								from.redirect(to);
						}

						const newRoots = AtomPath.findRoots(newRef);
						this._lock.extend(newRoots);
					}
			}
		}
	}

	path(): Path<V> {
		const _map = (ref: AtomRef<V>): Set<PathNode<V>> => {
			const atom = ref.resolve()
			if(!atom) return Set();

			const parents = atom?.parents.flatMap(_map)
			return Set([new PathNode(parents, atom.val)])
		}
		
		return new Path(_map(this._tip));
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

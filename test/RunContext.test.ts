import { inspect } from 'util'
import { Map, Set } from 'immutable'
import { delay } from './helpers'

describe('atoms and stuff', () => {

	it('pristine head has no atom', () => {
		const head = new Head(new AtomRef());
		const atom = head.ref.resolve();
		expect(atom).toBeUndefined();
	})

	it('committing creates atom', () => {
		const root = new AtomRef<number>();
		
		const head = root.spawnHead()
		head.commit(1);
		
		const atom = head.ref.resolve();
		expect(atom).not.toBeUndefined();
		expect(atom?.val).toBe(1);
		expect(atom?.parents.size).toBe(1);
		expect(atom?.parents.first(undefined)?.resolve()).toBeUndefined();
	})

	it('committing several times appends many atoms', async () => {
		const root = new AtomRef();
		const head = root.spawnHead();
		head.commit(1);
		head.commit(2);
		head.commit(3);

		const atom3 = head.ref.resolve();
		expect(atom3?.val).toBe(3);

		const atom2 = atom3?.parents.first(undefined)?.resolve();
		expect(atom2?.val).toBe(2);
		
		const atom1 = atom2?.parents.first(undefined)?.resolve();
		expect(atom1?.val).toBe(1);

		expect(atom1?.parents.size).toBe(1);
		expect(atom1?.parents.first(undefined)?.resolve()).toBeUndefined();
	})

  

	

	it('like-for-like rewrite', async () => {
		const head = new AtomRef<number>().spawnHead();
		head.commit(1);
		head.commit(2);
		head.commit(3);

		const path = await head.lockPath();
		expect(path.maxDepth()).toBe(3)

		const before = path.path().render()

		path.rewrite(fn => atom => {
			const newParents = atom.parents.map(fn)
			return [Set(), new Atom(newParents, atom.val)]
		}).write();

		const after = path.path().render()
		expect(after).toEqual(before)
	})

	it('two heads rewrite', async () => {
		const root = new AtomRef<string>();
		const head1 = root.spawnHead();
		
		head1.commit('1:1');

		const head2 = head1.ref.spawnHead();
		
		head1.commit('1:2');
		head2.commit('2:1');

		const path1 = await head1.lockPath();
		expect(path1.maxDepth()).toBe(2)

		const before = path1.path().render()

		await path1.rewrite(fn => atom => {
			const newParents = atom.parents.map(fn)
			return [Set(), new Atom(newParents, atom.val)]
		}).write().then(p => p.release());

		const after1 = path1.path().render()
		expect(after1).toEqual(before)

		const path2 = await head2.lockPath();
		const after2 = path2.path().render();

		console.log('after1', inspect(after1, { depth: 5 }));
		console.log('after2', inspect(after2, { depth: 5 }));
	})

	it('locking', async () => {
		const root = new AtomRef<string>();

		const head1 = root.spawnHead();
		head1.commit('1:1');

		const head2 = head1.spawnHead();
		head2.commit('2:1');

		head1.commit('1:2');

		const path1 = await head1.lockPath();

		let locked2 = false;
		head2.lockPath().then(() => locked2 = true);

		await delay(100);
		expect(locked2).toBeFalsy();

		path1.release();
		await delay(0);
		expect(locked2).toBeTruthy();
	})

	it('path -> patch -> path lock', async () => {
		const root = new AtomRef<string>();

		const head1 = root.spawnHead();
		head1.commit('1:1');

		const head2 = head1.spawnHead();
		head2.commit('2:1');

		head1.commit('1:2');

		const path1_1 = await head1.lockPath();

		let head2Activated = false;
		head2.lockPath().then(() => head2Activated = true);

		await delay(50);
		expect(head2Activated).toBeFalsy();

		const path1_2 = await path1_1.rewrite(visit => atom => {
			const parents = atom.parents.map(visit)
			return [Set(), new Atom(parents, atom.val)]
		}).write(); 

		path1_1.release(); //should do nothing as already released

		await delay(50);
		expect(head2Activated).toBeFalsy();

		//to fix this...
		//AtomPath when it gains the lock, needs to refind its roots
		//if the roots are the same as when it locked: hurrah
		//
		//otherwise, it needs to lock the new roots it finds
		//
		//but what if in gaining, relocking it loses its place in the queue of locks?
		//it should hold the locks it has till it can have all the locks it wants
		//
		//but in holding some locks but not others, is it possible to beget deadlock?
		//if two parties are trying to lock the same combination of roots, and are getting one ahead of the other symetrically
		//deadlock could occur; but this is always the case
		//because our locking is kind of stupid: when one lock is got, its held till the net one is gained
		//
		//what should happen: every lock as it's released should make itself available to *every* waiter
		//but should only be gained if a waiter can gain *all* the roots its waiting on
		//
		//in short, waiting and locking should be mediated by a single locking service, otherwise deadlocks are inevitable
		//WE NEED A CENTRAL LOCKING SERVICE!!!

		path1_2.release();

		await delay(0);
		expect(head2Activated).toBeTruthy();
	})

	xit('saving', async () => {
		const root = new AtomRef<string>();
		
		const head = root.spawnHead();
		head.commit('1:1');
		head.commit('1:2');
		head.commit('1:3');

		const path = await head.lockPath()
		console.log(inspect(path.path().render(), { depth: 5 }))

		expect(path.maxDepth()).toBe(3)

		let bag = Set<string>()
		const maxBagSize = 2;
		let full = false

		const patch = path.rewrite(visit => atom => {
			const parents = atom.parents.map(visit);

			//if there are no parents, then we should add to the bag with wild abandon
			//its really two kinds of rewrites: one that gathers till it can't save any more
			//then a like-for-like remap
			//
			//it's not that the bag is necessarily full: it's that it's been extended to its full extent
			//so, you could call it 'full'

			//but the fullness isn't a property of the bag, but of the branched traverse
			//we can say we want to repeatedly save till we've covered the full tree anyway: so the like-for-like near-at-hand mapping
			//may not actually be a thing
			//
			//but even in this case, we want a width-first saving
			//not width first! most important thing is persisting vertically, so we cover the precise data we've decided is momentarily most valuable
			//we want to save the first head to it's full extent hopefully
			//this involves repthing after each partial save till we've saved to the head
			//if there's any capacity after this in the transaction, we should work down the list of heads till all are sufficiently saved

			//so, we do want to like-for-like map before second save? nope - cos this would raise the spectre of relocking, and requires a mechanism
			//of direct lock delegation, which complication I'd prefer to avoid

			//but oh no, yes we do!
			//we want to keep the lock, but repeatedly rewrite the same path
			//so we do want to rewrite with two apparent modes
			//
			//the bottom part of a semilattice is a semilattice: there's nothing special about the top by the roots: thinkof it as less a tree, and more a rectangular cake
			//having rewritten the top, the surplus part is the same shape again: we should be able to start again happily

			//---
			//a problem here is that as soon as the patch is written, 
			//we have a new set of roots; and so other heads now have a chance to get in our way
			//we want to sneakily lock the new tree as we patch...

			//this lets us have a second go at the saving if we wish

			//by this point, we should have worked to the roots, and collected gubbins into our set




			const newBag = bag.add(atom.val)
			if(newBag.size)


			if (!full) { //but even if bag is full, we might be able to still collect forwards
					//we always have to see if we can merge

				const newBag = bag.add(atom.val)

				if (newBag.size <= maxBagSize) {
					bag = newBag;
					return [Set(), null]
				}
			}

			if (bag.size <= maxBagSize) {
				//ALWAYS TRY TO ADD TO BAG unless: we're just idly skipping forwards; the crawl has two modes
			}

			return [Set(), new Atom(parents, atom.val)];
		});

		patch.write(); //before we write, we want to lock the new roots: 

		console.log(inspect(path.path().render(), { depth: 5 }))

		expect(bag.size).toBe(1);
		expect(path.maxDepth()).toBe(1);
	})

})


type AtomVisitor<V> = (atom: Atom<V>) => readonly [Set<AtomRef<V>>, Atom<V>|null]

type AtomPatch<V> = { write(): Promise<AtomPath<V>> }

class AtomPath<V> {
	private readonly _head: Head<V>
	private readonly _locks: Set<Lock>

	constructor(head: Head<V>, locks: Set<Lock>) {
		this._head = head;
		this._locks = locks;
	}

	release() {
		this._locks.forEach(l => l.release());
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

		return plumbDepth(this._head.ref, 0);
	}

	rewrite(fn: (self: (a: AtomRef<V>) => AtomRef<V>) => AtomVisitor<V>): AtomPatch<V> {
		let redirects = Map<AtomRef<V>, AtomRef<V>>();

		const visitor: AtomVisitor<V> = fn(ref => {
			const atom = ref.resolve();
			if(!atom) return ref;
			else {
				const [otherSources, newAtom] = visitor(atom);
				const newRef = new AtomRef(newAtom);

				redirects = redirects.merge(otherSources.add(ref).map(r => [r, newRef]));

				return newRef;
			}
		});

		const atom = this._head.ref.resolve();
		if(!atom) return { write: () => Promise.resolve(this) };
		else {
			const [otherSources, newAtom] = visitor(atom);
			const newRef = new AtomRef(newAtom);

			redirects = redirects.merge(otherSources.add(this._head.ref).map(r => [r, newRef]));

			return {
					write: async () => {
						for (let [from, to] of redirects) {
								from.redirect(to);
						}

						const newRoots = AtomPath.findRoots(newRef)
						const newLocks = Set(await Promise.all(newRoots.map(a => a.lock())))

						this._head.ref = newRef;

						this.release();

						return new AtomPath(this._head, newLocks)
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
		
		return new Path(_map(this._head.ref))
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
	ref: AtomRef<V>

	constructor(ref: AtomRef<V>) {
		this.ref = ref;
	}

	commit(val: V): AtomRef<V> {
		return this.ref = new AtomRef(new Atom(Set([this.ref]), val))
	}

	spawnHead(): Head<V> {
		return new Head(this.ref);
	}

	async lockPath(): Promise<AtomPath<V>> {
		const roots = AtomPath.findRoots(this.ref);
		const locks = await Promise.all(roots.map(a => a.lock()))
		return new AtomPath(this, Set(locks));
	}
}


type Lock = { release(): void }



type AtomTarget<V> = Atom<V> | AtomRef<V> | null;

class AtomRef<V> {
	readonly _type = 'AtomRef'
  private _target: AtomTarget<V>

	constructor(target?: AtomTarget<V>) {
		this._target = target || null;
	}

	spawnHead(): Head<V> {
		return new Head(this);
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

	private _waits = Promise.resolve()

	async lock(): Promise<Lock> {
		return new Promise<Lock>(resolve1 => {
			this._waits = this._waits
				.then(() => new Promise(resolve2 => {
					resolve1({
						release: () => resolve2()
					});
				}))
		})

		//after locking we should always check that resolution is up to date: it may have been re-referred elsewhere 
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


	


	


	


	


//what about locking? 
//presumably we lock AtomData as it's concrete and ultimately shared
//
//but if one locker locks it, and it then gets replaced
//then there'll be would be waiters suddenly with an obsolete, forgotten AtomData in their hands
//
//synchronising on the AtomRef feels unintuitive - not that it's necessarily wrong, just that I have to convince myself
//
//if we lock the AtomRef that is the root reference of our path, and is presumably an AtomRef to nothing
//nah, shouldn't be to nothing...




// class Atom {
//     private _parents: Set<Atom>
//     private _rows: Map<string, any> = Map<string, any>()
// 		private _target: Atom = this;

//     constructor(parents?: Set<Atom>, rows?: { [id: string]: any }) {
//         this._parents = Set(parents || []);
//         this._rows = Map(rows || {});
//     }

//     parents(): Set<Atom> {
//       return this.resolve()?._parents || Set();
//     }

//     rows(): RowMap {
//       return this.resolve()?._rows || Map();
//     }

//     redirect(target: Atom) {
// 			console.assert(this._target === this);
// 			this._target = target;
//     }

//     private resolve(): Atom|undefined {
// 			return this._target &&
// 				(this._target === this ? this : this._target.resolve())
//     }

//     async lock(): Promise<Lock> {
//         return {
//             release() { }
//         }
//     }
// }


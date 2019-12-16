import { inspect } from 'util'
import { Map, Set } from 'immutable'

describe('atoms and stuff', () => {

	it('pristine head has no atom', () => {
		const head = new Head(new AtomRef());

		const atom = head.ref.resolve();
		expect(atom).toBeUndefined();
	})

	it('committing creates atom', () => {
		const head = new Head(new AtomRef());
		head.commit({ id: 1 });
		
		const atom = head.ref.resolve();
		expect(atom).not.toBeUndefined();
		expect(atom?.rows.get('id')).toBe(1);
		expect(atom?.parents.size).toBe(1);
		expect(atom?.parents.first(undefined)?.resolve()).toBeUndefined();
	})

	it('committing several times appends many atoms', async () => {
		const head = new Head(new AtomRef());
		head.commit({ id: 1 });
		head.commit({ id: 2 });
		head.commit({ id: 3 });

		const atom3 = head.ref.resolve();
		expect(atom3?.rows.get('id')).toBe(3);

		const atom2 = atom3?.parents.first(undefined)?.resolve();
		expect(atom2?.rows.get('id')).toBe(2);
		
		const atom1 = atom2?.parents.first(undefined)?.resolve();
		expect(atom1?.rows.get('id')).toBe(1);

		expect(atom1?.parents.size).toBe(1);
		expect(atom1?.parents.first(undefined)?.resolve()).toBeUndefined();
	})

	it('like-for-like rewrite', async () => {
		const head = new Head(new AtomRef());
		head.commit({ id: 1 });
		head.commit({ id: 2 });
		head.commit({ id: 3 });

		const [, path] = await head.lockPath();
		expect(path.maxDepth()).toBe(3)

		const before = path.path().render()

		const patch = path.rewrite(fn => ref => {
			const atom = ref.resolve();
			if(!atom) return [Map(), ref]
			else {
				const newParents = atom.parents.map(fn)
				const newAtom = new Atom(newParents)
				const newRef = new AtomRef(newAtom);

				return [Map([[ref, newRef]]), newRef]
			}
		});

		patch.write();

		const after = path.path().render()
		expect(after).toEqual(before)
	})

	type Bag = Map<string, any>

	const gather = (head: Head): [Lock, Bag] => {
			throw ''
	}

	xit('saving', async () => {
		const head = new Head(new AtomRef());

		head.commit({ 1: 1 });
		head.commit({ 1: 2 });
		head.commit({ 1: 3 });

		const [, path] = await head.lockPath()
		console.log(inspect(path, { depth: 5 }))

		expect(path.maxDepth()).toBe(3)

		let bag = Map<string, any>();
		const maxBagSize = 2;
		let full = false

		const patch = path.rewrite(visit => ref => {
			const atom = ref.resolve(); //prob should resolve outside as part of dispatch
			if(!atom) return [Map(), ref];

			const parents = atom.parents.map(visit);

			if (!full) { //but even if bag is full, we might be able to still collect forwards
					//we always have to see if we can merge

				const newBag = bag.mergeWith((r0, _r1) => r0, atom.rows) //prefer downstream

				if (newBag.size <= maxBagSize) {
					bag = newBag;
					const newRef = new AtomRef();
					return [Map([[ref, newRef]]), newRef];
				}
			}

			if (bag.size <= maxBagSize) {
				//ALWAYS TRY TO ADD TO BAG unless: we're just idly skipping forwards; the crawl has two modes
			}

			const newRef = new AtomRef(new Atom(parents, atom.rows))
			return [Map([[ref, newRef]]), newRef];
		});

		patch.write();

		console.log(inspect(path, { depth: 5 }))

		expect(bag.size).toBe(1);
		expect(path.maxDepth()).toBe(1);
	})

})


type AtomVisitor = (atom: AtomRef) => [Map<AtomRef, AtomRef>, AtomRef]

type AtomPatch = { write(): void }

class AtomPath {
	roots: Set<Atom>
	head: Head

	constructor(roots: Set<Atom>, head: Head) {
			this.roots = roots;
			this.head = head;
	}

	maxDepth(): number {
		const plumbDepth = (ref: AtomRef, d: number): number => {
			const atom = ref.resolve();
			return atom
				? (atom.parents
						.map(p => plumbDepth(p, d + 1))
						.max() || (d + 1))
				: d;
		}

		return plumbDepth(this.head.ref, 0);
	}

	rewrite(fn: (self: (a: AtomRef) => AtomRef) => AtomVisitor): AtomPatch {
			let redirects = Map<AtomRef, AtomRef>();

			const visitor: AtomVisitor = fn(ref => {
					const [newRedirects, newRef] = visitor(ref);
					redirects = redirects.merge(newRedirects);
					return newRef;
			});

			const [newRedirects, newRef] = visitor(this.head.ref);
			redirects = redirects.merge(newRedirects);

			return {
					write: () => {
							for (let [from, to] of redirects) {
									from.redirect(to);
							}

							this.head.ref = newRef;
					}
			}
	}

	path(): Path<Map<string, any>> {
		const _map = (ref: AtomRef): Set<PathNode<Map<string, any>>> => {
			const atom = ref.resolve()
			if(!atom) return Set();

			const parents = atom?.parents.flatMap(_map)
			return Set([new PathNode(parents, atom.rows)])
		}
		
		return new Path(_map(this.head.ref))
	}
}


class Head {
    ref: AtomRef

    constructor(ref: AtomRef) {
        this.ref = ref;
    }

    commit(rows: { [id: string]: any }) {
			this.ref = new AtomRef(new Atom(Set([this.ref]), Map(rows)))
    }

    async lockPath(): Promise<[Lock, AtomPath]> {
        const roots = Head.findRoots(this.ref);
        const locks = await Promise.all(roots.map(a => a.lock()))
        return [
            { release: () => locks.forEach(l => l.release()) },
            new AtomPath(roots, this)
        ];
    }

    private static findRoots(ref: AtomRef): Set<Atom> {
			const atom = ref.resolve();
			return atom
				? (atom.parents.isEmpty()
					 ? Set([atom])
					 : atom.parents.flatMap(Head.findRoots))
			  : Set();
    }
}


type Lock = { release(): void }



type AtomTarget = Atom | AtomRef | undefined;

class AtomRef {
	readonly _type = 'AtomRef'
  private _target: AtomTarget

	constructor(target?: AtomTarget) {
		this._target = target;
	}

	redirect(target: AtomTarget) {
		this._target = target;
	} 
	
	resolve(): Atom|undefined {
		const t = this._target;
		if(t) {
			switch(t._type) {
				case 'Atom': return t;
				case 'AtomRef': return t.resolve();
			}
		}
	}
}

class Atom {
	readonly _type = 'Atom'
	readonly parents: Set<AtomRef>
	readonly rows: Map<string, any>

	constructor(parents?: Set<AtomRef>, rows?: Map<string, any>) {
		this.parents = parents || Set();
		this.rows = rows || Map();
	}

	async lock(): Promise<Lock> {
		//after locking we should always check that resolution is up to date: it may have been re-referred elsewhere 
		return {
			release() {}
		}
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


import _ from 'lodash'
import {inspect} from 'util'
import { Map, List, Set } from 'immutable'

describe('atoms and stuff', () => {

    it('committing appends atom', () => {
        const root = new Atom();
        
        const x = new Context(new Head(root));

        x.head.commit({});

        expect(x.head.atom.parents().size).toBe(1);

        const [firstParent,] = x.head.atom.parents();
        expect(firstParent.parents().isEmpty()).toBeTruthy();
    })

    it('committing several times appends many atoms', async () => {
        const root = new Atom();
        const x = new Context(new Head(root));

        x.head.commit({ 1: 1 });
        x.head.commit({ 1: 2 });
        x.head.commit({ 1: 3 });

				const [, path] = await x.head.lockPath();

        expect(path.maxDepth()).toBe(4)
    })


		type Bag = Map<string, any>
		
		const gather = (head: Head): [Lock, Bag] => {
				throw ''
		}
		
    it('saving', async () => {
        const root = new Atom();
        const x = new Context(new Head(root));

        x.head.commit({ 1: 1 });
        x.head.commit({ 1: 2 });
        x.head.commit({ 1: 3 });

				const [, path] = await x.head.lockPath()

				//it's all about rewriting the path to the tip: looked at this way, we're going with the grain
				//but as we rewrite, we also redirect, so other paths will heed our current rewrites

				//if all parents plus me can be combined without increasing number of rows
				//then combine them

				let bag = Map<string, any>();
				const maxBagSize = 2;
				let full = false
				
				const patch = path.rewrite(visit => atom => {						
						const parents = atom.parents().map(visit);

						if(!full) { //but even if bag is full, we might be able to still collect forwards
								//we always have to see if we can merge
								
								const newBag = bag.mergeWith((r0, _r1) => r0, atom.rows()) //prefer downstream

								if(newBag.size <= maxBagSize) {
										bag = newBag;
										const newAtom = new Atom();
										return [Map([[atom, newAtom]]), newAtom];
								}
						}

						if(bag.size <= maxBagSize) {
								//ALWAYS TRY TO ADD TO BAG unless: we're just idly skipping forwards; the crawl has two modes
						}

						const newAtom = new Atom(parents, atom.rows())
						return [Map([[atom, newAtom]]), newAtom];
				});

				patch.write();

        console.log(inspect(path, { depth: 5 }))

				expect(bag.size).toBe(1);
				expect(path.maxDepth()).toBe(1);
    })

})


type AtomReplacer = (atom: Atom) => Atom
type AtomVisitor = (atom: Atom) => [Map<Atom, Atom>, Atom]

type AtomPatch = { write(): void }

class AtomPath {
		roots: Set<Atom>
		head: Head

		constructor(roots: Set<Atom>, head: Head) {
				this.roots = roots;
				this.head = head;
		}

		maxDepth(): number {
				const plumbDepth = (a: Atom, d: number): number =>
						a.parents()
								.map(p => plumbDepth(p, d + 1))
								.max() || d;

				return plumbDepth(this.head.atom, 1);
		}

		rewrite(fn: (self: AtomReplacer) => AtomVisitor): AtomPatch {
				let redirects = Map<Atom,Atom>();

				const visitor: AtomVisitor = fn(atom => {
						const [newRedirects, newAtom] = visitor(atom);
						redirects = redirects.merge(newRedirects);
						return newAtom;
				});

				const [newRedirects, newAtom] = visitor(this.head.atom);
				redirects = redirects.merge(newRedirects);

				return {
						write: () => {
								for(let [from, to] of redirects) {
										from.redirect(to);
								}
								
								this.head.atom = newAtom;
						}
				}
		}

}


class Head {
    atom: Atom

    constructor(atom: Atom) {
        this.atom = atom;
    }

    commit(rows: { [id: string]: any }) {
				this.atom = new Atom(Set([this.atom]), Map(rows))
    }
		
		async lockPath(): Promise<[Lock, AtomPath]> {
				const roots = Head.findRoots(this.atom);
				const locks = await Promise.all(roots.map(a => a.lock()))
				return [
						{ release: () => locks.forEach(l => l.release()) },
						new AtomPath(roots, this)
				];
		}

		private static findRoots(atom: Atom): Set<Atom> {
				const parents = atom.parents();
				return parents.isEmpty()
				    ? Set([atom])
						: parents.flatMap(Head.findRoots);
		}
}

type RowMap = Map<string, any>

class Context {
    head: Head;

    constructor(head: Head) {
        this.head = head;
    }
}


type Lock = { release(): void }

class Atom {
		private _parents: Set<Atom>
    private _rows: Map<string, any> = Map<string, any>()
		private _redirection: Atom|undefined

		constructor(parents?: Set<Atom>, rows?: { [id: string]: any }) {
				this._parents = Set(parents || []);
				this._rows = Map(rows || {});
		} 

		parents(): Set<Atom> {
				return this.resolve()._parents;
		}

		rows(): RowMap {
				return this.resolve()._rows;
		}

		redirect(target: Atom) {
				console.assert(!this._redirection);
				this._redirection = target;
		}

		private resolve(): Atom {
				return this._redirection || this;
		}

		async lock(): Promise<Lock> {
				return {
						release() {}
				}
		}
}


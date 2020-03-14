import { Set, Map } from 'immutable'
import { Atom, AtomRef } from './atoms'
import { Lock } from './Locks'

export type AtomVisitor<V> = (ref: AtomRef<V>, atom: Atom<V>) => readonly [AtomRef<V>[], Atom<V>|null]

export type AtomPatch = { complete(): void }

export default class AtomPath<V> {
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
				.flatMap(r => r.resolve())
				.flatMap(a => plumbDepth(a.parents, d + 1))
				.concat([d]);

		return plumbDepth(this._tips, 0).max() || 0;
	}

	hasAtoms(): boolean {
		return this._tips.some(r => !!r.resolve().length);
	}	

	rewrite(fn: (self: (a: AtomRef<V>) => AtomRef<V>) => AtomVisitor<V>): AtomPatch {
		let redirects = Map<AtomRef<V>, AtomRef<V>>();

		const visitor: AtomVisitor<V> = fn(ref => {
			return redirects.get(ref) || (() => {
				const [atom] = ref.resolve();
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
			const [atom] = ref.resolve();
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
			const [atom] = ref.resolve()
			if(!atom) return Set();

			const parents = atom?.parents.flatMap(_map)
			return Set([new PathNode(parents, atom.val)])
		}
		
		return new Path(this._tips.flatMap(_map));
	}

	static findRoots<V>(ref: AtomRef<V>): Set<Atom<V>> {
		const [atom] = ref.resolve();
		if(!atom) return Set();
		else {
			const above = atom.parents.flatMap(AtomPath.findRoots);
			return above.isEmpty() ? Set([atom]) : above;
		}
	}
}

export class Path<V> {
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

export class PathNode<V> {
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

import { Set, Map, OrderedSet } from 'immutable'
import { Atom, AtomRef } from './atoms'
import { Lock } from './Locks'
import { inspect } from 'util'

export type AtomVisitor<V> = (ref: AtomRef<V>, atom: Atom<V>) => readonly [AtomRef<V>[], Atom<V>|null]

export type AtomPatch = { complete(): void }

export default class AtomPath<V> {
	readonly tips: Set<AtomRef<V>>
	private readonly _lock: Lock

	constructor(tips: AtomRef<V>[], lock: Lock) {
		this.tips = Set(tips);
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

		return plumbDepth(this.tips, 0).max() || 0;
	}

	hasAtoms(pred?: (a: Atom<V>) => boolean): boolean {
		return this.tips.some(r => {
			const [a] = r.resolve()
			return !!a && (!pred || pred(a));
		});
	}	

	hasPendingAtoms(): boolean {
		return this.hasAtoms(a => !!a.weight);
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

		const newRefs = this.tips.flatMap(ref => {
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
		
		return new Path(this.tips.flatMap(_map));
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
}

//PLAN:
//- make Heads mutable
//- each head tracks incoming weight
//- rewrites track outgoing/incoming weight

//do heads have to be mutable?
//at this point I'd prefer it

//because...
//each new machine would have a head
//Heads would then take atoms and turn them into refs
//atoms then have weight on them and are streamed from there
//

export function renderPath<V>(p: Path<V>) {
	const log = (indent: number = 0, l: string = '') => {
		for(let i = 0; i < indent; i++) process.stdout.write('  ');
		process.stdout.write(l + '\n')
	};
	
	const set = visit(OrderedSet(), p.nodes, 0);

	log(0, '--PATH--')
	set.forEach((l) => log(1, inspect(l.value)))
	log()

	function visit(set: OrderedSet<PathNode<V>>, nodes: Set<PathNode<V>>, d: number): OrderedSet<PathNode<V>> {
		return nodes.reduce(
			(ac, n) => {
				const ac2 = visit(ac, n.parents, d + 1);
				return ac2.add(n);
			},
			set);
	}
}

export function renderAtoms<V>(refs: Set<AtomRef<V>>) {
	const log = (indent: number = 0, l: string = '') => {
		for(let i = 0; i < indent; i++) process.stdout.write('  ');
		process.stdout.write(l + '\n')
	};

	const tips = refs.flatMap(r => r.resolve())
	
	const ordered = visit(OrderedSet(), tips, 0);

	log(0, '--ATOMS--')
	ordered.forEach((l) =>
		log(0,
				'\x1b[39m'
			+ (tips.contains(l) ? '+ ' : '  ')
			+ (l.weight > 0 ? (l.weight + ' \x1b[31m') : '  \x1b[34m')
			+ inspect(l.val)))
	log()

	function visit(zero: OrderedSet<Atom<V>>, refs: Set<Atom<V>>, d: number): OrderedSet<Atom<V>> {
		return refs.reduce(
			(ac, a) => {
				const ac2 = visit(ac, a.parents.flatMap(r => r.resolve()), d + 1);
				return ac2.add(a);
			},
			zero);
	}
}

import { Set, Map, OrderedSet, List } from 'immutable'
import { Atom, AtomRef, AtomLike } from './atoms'
import { Lock } from './Locks'
import { inspect } from 'util'
import _Monoid from './_Monoid'

type VisitRef<Ac,V> = (ref: AtomRef<V>) => [Ac, AtomRef<V>?]; 
type VisitRefs<Ac,V> = (refs: List<AtomRef<V>>) => [Ac, List<AtomRef<V>>]

export type VisitAtom<Ac, V> = (atom: [AtomRef<V>, Atom<V>]) => readonly [Ac, [AtomRef<V>[], Atom<V>|AtomRef<V>]?]

export type AtomPatch<Ac> = { complete(): Ac }

export default class AtomPath<V> {
	readonly tips: List<AtomRef<V>>
	private readonly _lock: Lock

	constructor(tips: AtomRef<V>[], lock: Lock) {
		this.tips = List(tips);
		this._lock = lock;
	}

	release() {
		this._lock.release();
	}

	maxDepth(): number {
		const plumbDepth = (refs: List<AtomRef<V>>, d: number): List<number> =>
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
		return this.hasAtoms(a => a.isActive());
	}

	
	rewrite<Ac=undefined>(fn: (visitRefs: VisitRefs<Ac,V>) => VisitAtom<Ac, V>, MA: _Monoid<Ac>): AtomPatch<Ac> {
		let redirects = Map<AtomRef<V>, AtomRef<V>>();

		const inner: (visitAtom: ()=>VisitAtom<Ac,V>) => VisitRef<Ac,V> =
      visitAtom => ref => {
        const found = redirects.get(ref);
        if(found) return [MA.zero, found];

        const [atom] = ref.resolve();
        if(!atom) return [MA.zero]; //ignore empty ref

				if(!atom.isActive()) return [MA.zero, ref];

        const [ac, res] = visitAtom()([ref, atom]);
        if(!res) return [ac, ref];

        const [sources, a] = res;
        const newRef = (a instanceof Atom) ? new AtomRef(a) : a;

        redirects = redirects.merge(
          Set(sources).map(r => [r, newRef]));

        return [ac, newRef];
      };
    
    const outer: (visitRef: VisitRef<Ac,V>) => VisitRefs<Ac,V> =
      visitRef => refs =>
        refs.reduce<[Ac, List<AtomRef<V>>]>(
          ([ac1,rs], ref) => {
            const [ac2, r] = visitRef(ref);
            const ac3 = MA.add(ac1, ac2);
            return [ac3, r ? rs.push(r) : rs];
          }, [MA.zero,List()]);

		const visitRefs = outer(inner(() => fn(visitRefs)));
		const [ac, newRefs] = visitRefs(this.tips);

		return {
			complete: () => {
				// console.log('redirects', ...redirects.valueSeq().flatMap(r => r.resolve()));
				
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

				// const newRoots = Set(newRefs).flatMap(AtomPath.findRoots);
				// this._lock.extend(newRoots);

				const newRoots = Set(this.tips).flatMap(AtomPath.findRoots);
				this._lock.extend(newRoots);

				return ac;
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

	static findRoots<V>(ref: AtomRef<V>): List<Atom<V>> {
		const [atom] = ref.resolve();
		if(!atom || atom.state == 'taken') return List();
		else {
			const above = atom.parents.flatMap(AtomPath.findRoots);
			return above.isEmpty() ? List([atom]) : above;
		}
	}
}

export class Path<V> {
	readonly nodes: List<PathNode<V>>

	constructor(nodes: List<PathNode<V>>) {
		this.nodes = nodes;
	}

	map<Y>(fn: (v:V) => Y): Path<Y> {
		return new Path(this.nodes.map(n => n.map(fn)))
	}

	render(): any {
		return this.nodes.map(n => n.render()).toArray();
	}
}

export class PathNode<V> {
	readonly parents: List<PathNode<V>>
	readonly value: V

	constructor(parents: List<PathNode<V>>, val: V) {
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

	function visit(set: OrderedSet<PathNode<V>>, nodes: List<PathNode<V>>, d: number): OrderedSet<PathNode<V>> {
		return nodes.reduce(
			(ac, n) => {
				const ac2 = visit(ac, n.parents, d + 1);
				return ac2.add(n);
			},
			set);
	}
}


type Traced<V> = [V, Traced<V>[]] 

export function tracePath<V>(refs: List<AtomLike<V>>): Traced<V>[] {

	function visitAtom(a: Atom<V>): Traced<V> {
		return [a.val, visitList(a.parents)];
	}

	function visitList(rs: List<AtomLike<V>>) {
		return rs
			.flatMap(r =>
				   (r?._type == 'Atom' && [r])
				|| (r?._type == 'AtomRef' && r.resolve())
				|| [])
			.map(visitAtom)
			.toArray();
	}

	return visitList(refs);	
}

export function renderAtoms<V>(refs: List<AtomLike<V>>) {
	const log = (indent: number = 0, l: string = '') => {
		for(let i = 0; i < indent; i++) process.stdout.write('  ');
		process.stdout.write(l + '\n')
	};

	const tips = refs.flatMap(r =>
		   (r?._type == 'Atom' && List([r]))
		|| (r?._type == 'AtomRef' && r.resolve())
		|| List<Atom<V>>()
		).toSet();
	
	const ordered = visit(OrderedSet(), tips, 0);

	log(0, '--ATOMS--')
	ordered.forEach((l) =>
		log(0,
				'\x1b[39m'
			+ (tips.contains(l) ? '+ ' : '  ')
			+ (l.weight + ' ')
			+ (l.state == 'active' ? '\x1b[31m' : '\x1b[34m')
			+ inspect(l.val)))
	log()

	function visit(zero: OrderedSet<Atom<V>>, refs: Set<Atom<V>>, d: number): OrderedSet<Atom<V>> {
		return refs.reduce(
			(ac, a) => {
				const ac2 = visit(ac, a.parents.flatMap(r => r.resolve()).toSet(), d + 1);
				return ac2.add(a);
			},
			zero);
	}
}

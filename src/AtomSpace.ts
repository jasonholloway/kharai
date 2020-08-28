import { Lock, Locks } from './Locks'
import { Set } from 'immutable'
import { Atom, AtomRef } from './atoms'
import AtomPath from './AtomPath'

export default class AtomSpace<V> {
	private _locks: Locks = new Locks();

	lock<V>(atoms: Set<Atom<V>>): Promise<Lock> {
		return this._locks.lock(...atoms);
	}

	head(ref?: AtomRef<V>): Head<V> {
		const head = new Head(this, Set(ref ? [ref] : []));
		return head;
	}

	async lockTips(...tips: AtomRef<V>[]): Promise<AtomPath<V>> {
		const _tips = Set(tips);
		let roots1 = _tips.flatMap(AtomPath.findRoots);

		while(true) {
			const lock = await this.lock(roots1);
			const roots2 = _tips.flatMap(AtomPath.findRoots);

			if(roots2.equals(roots1)) {
				return new AtomPath([..._tips], lock);
			}
			else {
				roots1 = roots2;
				lock.release();
			}
		}
	}
}


export class Head<V> {
	private readonly _space: AtomSpace<V>
	private readonly _refs: Set<AtomRef<V>>

	constructor(space: AtomSpace<V>, refs: Set<AtomRef<V>>) {
		this._space = space;
		this._refs = refs;
	}

	move(ref: AtomRef<V>) {
		return new Head(this._space, Set([ref]))
	}

	write(val: V): Head<V> {
		const atom = new Atom(this._refs, val);
		const ref = new AtomRef(atom);
		return new Head(this._space, Set([ref]));
	}

	addUpstreams(refs: Set<AtomRef<V>>): Head<V> {
		//for efficiency: simply superceded atoms eagerly purged
		//imperfect, but catches common case
		const newRefs = this._refs
			.subtract(refs.flatMap(r => r.resolve()).flatMap(a => a.parents))
			.union(refs);

		return new Head(this._space, newRefs);
	}

	refs() {
		return this._refs;
	}
}


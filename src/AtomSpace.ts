import Locks, { Lock } from './Locks'
import { Set } from 'immutable'
import { Atom, AtomRef, AtomLike } from './atoms'
import AtomPath from './AtomPath'

export default class AtomSpace<V> {
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

	static conjoin<V>(heads: Head<V>[], v: V) {
		const atom = new Atom(Set(heads).map(h => h._ref), v);
		for(const head of heads) {
			head._ref = new AtomRef(atom);
		}
	}
}


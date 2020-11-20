import { Lock, Locks } from './Locks'
import { Set, List } from 'immutable'
import { Atom, AtomRef } from './atoms'
import AtomPath from './AtomPath'
import { Subject, Observable, ReplaySubject } from 'rxjs';

export default class AtomSpace<V> {
	private _locks: Locks
  private _heads: List<Head<V>>
	private _head$: Subject<Head<V>>

	readonly head$: Observable<Head<V>>

	constructor() {
		this._locks = new Locks();
		this._heads = List();
		this._head$ = new Subject<Head<V>>();
		this.head$ = this._head$;
	}

	lock<V>(atoms: Set<Atom<V>>): Promise<Lock> {
		return this._locks.lock(...atoms);
	}

	head(...refs: AtomRef<V>[]): Head<V> {
		const head = new Head(this, Set(refs));
		this._heads = this._heads.push(head);
		this._head$.next(head);
		return head;
	}

	async lockTips(...tips: AtomRef<V>[]): Promise<AtomPath<V>> {
		const _tips = Set(tips);
		let roots1 = _tips.flatMap(AtomPath.findRoots);

		//repeatedly lock until stable
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
	private _refs: Set<AtomRef<V>>

	private readonly _atom$: Subject<AtomRef<V>>
	readonly atom$: Observable<AtomRef<V>>

	constructor(space: AtomSpace<V>, refs: Set<AtomRef<V>>) {
		this._space = space;
		this._refs = refs;

		this._atom$ = new ReplaySubject<AtomRef<V>>(1);
		this.atom$ = this._atom$;
	}

	release() {
		//TODO state machine here - three states thereof
		
		//tell AtomSpace to be rid of me here
		//tho can only do so when saved fully
		//machine releases, then space releases too,
		//but only after machine has released
		this._atom$.complete();
	}

	//BELOW SHOULD BE ONLY WAY TO CREATE AN ATOM!!!
	write(val: V, weight: number = 1): AtomRef<V> {
		const atom = new Atom(this._refs, val, weight);
		const ref = new AtomRef(atom);
		return this.move(ref);
	}

	move(ref: AtomRef<V>): AtomRef<V> {
		//should make sure child here(?)
		this._refs = Set([ref]);
    this._atom$.next(ref);
		return ref;
	}

	addUpstreams(refs: Set<AtomRef<V>>): void {
		//for efficiency: simply superseded atoms eagerly purged
		//imperfect, but catches common case

		//so, new atoms are being merged in here
		//this is merge as opposed to move-to
		//and we're keeping the head as small as possible
		//though here we're not adding a new atom
		//so there's no new weight to report
		const newRefs = this._refs
			.subtract(refs.flatMap(r => r.resolve()).flatMap(a => a.parents))
			.union(refs);

		this._refs = newRefs;
	}

	fork(): Head<V> {
		return this._space.head(...this._refs);
	}

	refs() {
		return this._refs;
	}
}


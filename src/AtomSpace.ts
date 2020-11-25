import { Lock, Locks } from './Locks'
import { Set, List } from 'immutable'
import { Atom, AtomRef } from './atoms'
import AtomPath from './AtomPath'
import { Subject, Observable, ReplaySubject } from 'rxjs';
import _Monoid from './_Monoid';

export default class AtomSpace<V> {
	private _locks: Locks
  private _heads: List<Head<V>>
	private _head$: Subject<Head<V>>
	private _weights: { created: number, staged: number, saved: number }

	readonly head$: Observable<Head<V>>

	constructor(mv: _Monoid<V>) {
		this._locks = new Locks();
		this._heads = List();
		this._head$ = new Subject<Head<V>>();
		this.head$ = this._head$;
		this._weights = { created: 0, staged: 0, saved: 0 };
	}

	newAtom(parents: Set<AtomRef<V>>, val: V, weight: number = 1): AtomRef<V> {
		const atom = new Atom<V>(parents, val, weight);
		this._weights.created += weight;
		return new AtomRef(atom);
	}

	incStaged(weight: number) {
		this._weights.staged += weight;
	}

	incSaved(weight: number) {
		this._weights.saved += weight;
	}
	

	lock<V>(atoms: Set<Atom<V>>): Promise<Lock> {
		return this._locks.lock(...atoms);
	}

	//shouldn't need heads to reach into atom graph
	//every atom needs saving, head or not...
	//which would take the pressure off releasing heads too

	head(...refs: AtomRef<V>[]): Head<V> {
		const head = new Head(this, Set(refs));
		this._heads = this._heads.push(head);
		this._head$.next(head);
		return head;
	}

	async lockPath(...tips: AtomRef<V>[]): Promise<AtomPath<V>> {
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

	weights() {
		const w = this._weights;
		return {
			...w,
			pending: w.created - (w.staged + w.saved)
		};
	}
}


export class Head<V> {
	readonly space: AtomSpace<V>
	private _refs: Set<AtomRef<V>>

	private readonly _atom$: Subject<AtomRef<V>>
	readonly atom$: Observable<AtomRef<V>>

	constructor(space: AtomSpace<V>, refs: Set<AtomRef<V>>) {
		this.space = space;
		this._refs = refs;

		this._atom$ = new ReplaySubject<AtomRef<V>>(1);
		this.atom$ = this._atom$;
	}

	release() {
		//TODO state machine here - three states thereof
		//machine releases, then space releases
		//...
		
		this._atom$.complete();
	}

	write(val: V, weight: number = 1): AtomRef<V> {
		const ref = this.space.newAtom(this._refs, val, weight);
		return this.move(ref);
	}

	move(ref: AtomRef<V>): AtomRef<V> {
		//should make sure child here(?)
		this._refs = Set([ref]);
    this._atom$.next(ref);
		return ref;
	}

	addUpstreams(refs: Set<AtomRef<V>>): void {
		//for efficiency: simply superseded atoms purged from head
		//stops loads of refs accumulating without compaction
		const newRefs = this._refs
			.subtract(refs.flatMap(r => r.resolve()).flatMap(a => a.parents))
			.union(refs);

		this._refs = newRefs;
	}

	fork(): Head<V> {
		return this.space.head(...this._refs);
	}

	refs() {
		return this._refs;
	}
}


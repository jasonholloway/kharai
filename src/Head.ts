import { AtomRef, Atom } from "./atoms";
import { Set, List } from "immutable";
import { Subject, Observable, ReplaySubject, Observer, BehaviorSubject } from "rxjs";
import { Weight, Commit } from "./AtomSpace";

export default class Head<V> {
	readonly sink: Observer<Commit<V>>
	private _refs: List<AtomRef<V>>

	// private readonly _atom$: Subject<List<AtomRef<V>>>
	// readonly atom$: Observable<AtomRef<V>>

	constructor(sink: Observer<[Weight,AtomRef<V>]>, refs?: List<AtomRef<V>>) {
		this.sink = sink;
		this._refs = refs ?? List();

		// this._atom$ = new BehaviorSubject<List<AtomRef<V>>>(refs);
		// this.atom$ = this._atom$;
	}

	release() {
		//TODO state machine here - three states thereof
		//machine releases, then space releases
		//...
		
		// this._atom$.complete();
	}

	write(val: V, weight: number = 1): AtomRef<V> {
		const ref = new Atom<V>(this._refs, val, weight).asRef();
		this.sink.next([weight, ref]);
		return this.move(ref);
	}

	move(ref: AtomRef<V>): AtomRef<V> {
		//should make sure child here(?)
		this._refs = List([ref]);
    // this._atom$.next(ref);
		return ref;
	}

	addUpstreams(refs: Set<AtomRef<V>>): void {
		//for efficiency: simply superseded atoms purged from head
		//stops loads of refs accumulating without compaction
		const newRefs = Set(this._refs)
			.subtract(refs.flatMap(r => r.resolve()).flatMap(a => a.parents))
			.union(refs)
			.toList();

		this._refs = newRefs;
	}

	fork(): Head<V> {
		return new Head<V>(this.sink, this._refs);
	}

	refs() {
		return this._refs;
	}
}

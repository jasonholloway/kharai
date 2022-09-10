import { AtomRef } from "./atoms";
import { OrderedSet } from "immutable";
import _Monoid from "./_Monoid";
import Commit from "./Committer";

export type CommitFac<V> = (rs?:OrderedSet<AtomRef<V>>)=>Commit<V>;

export default class Head<V> {

	private readonly _commitFac: CommitFac<V>
	private _commit: Commit<V>

	constructor(commitFac: CommitFac<V>, refs?: OrderedSet<AtomRef<V>>) {
		this._commitFac = commitFac;
		this._commit = this._commitFac(refs);
	}

	async write(val: V, weight: number = 1): Promise<AtomRef<V>> {
		const newRef = await this._commit.complete(val, weight);
		this._commit = this._commitFac(OrderedSet([newRef]));
		return newRef;
	}

	reset(): void {
		//TODO resetting should create a fresh commit with original upstreams
		//but - upstreams at this point are mingled within the bad commit
		//we should capture 'our' refs before any upstreams etc
		this._commit.abort();
	}

	addUpstreams(refs: OrderedSet<AtomRef<V>>): void {
		this._commit.addUpstreams(refs);
	}

	commit() {
		return this._commit;
	}

	refs() {
		return this._commit.refs();
	}

	fork(): Head<V> {
		return new Head<V>(this._commitFac, this._commit.refs());
	}

	release() {
		//TODO state machine here - three states thereof
		//machine releases, then space releases
		//...
		
		// this._atom$.complete();
	}
}

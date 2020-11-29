import _Monoid from './_Monoid'

export default abstract class Store<V> {
	protected _monoidV: _Monoid<V>;

	constructor(monoidV: _Monoid<V>) {
		this._monoidV = monoidV;
	}

	abstract prepare(v: V): {save(): Promise<void>}|false;
}

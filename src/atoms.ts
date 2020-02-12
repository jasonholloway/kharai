import { Set } from 'immutable'

export type AtomLike<V> = Atom<V> | AtomRef<V> | null;

export class AtomRef<V> {
	readonly _type = 'AtomRef'
  private _target: AtomLike<V>

	constructor(target?: AtomLike<V>) {
		this._target = target || null;
	}

	redirect(target: AtomLike<V>) {
		this._target = target;
	} 
	
	resolve(): Atom<V>|undefined {
		const t = this._target;
		if(t) {
			switch(t._type) {
				case 'Atom': return t;
				case 'AtomRef': return t.resolve();
			}
		}
	}
}

export class Atom<V> {
	readonly _type = 'Atom'
	readonly parents: Set<AtomRef<V>>
	readonly val: V

	constructor(parents: Set<AtomRef<V>>, val: V) {
		this.parents = parents;
		this.val = val;
	}
}

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
	
	resolve(): [Atom<V>]|[] {
		const t = this._target;
		if(t) {
			switch(t._type) {
				case 'Atom': return [t];
				case 'AtomRef': return t.resolve();
			}
		}
		return [];
	}
}

export class Atom<V> {
	readonly _type = 'Atom'
	readonly parents: Set<AtomRef<V>>
	readonly val: V
	readonly saved: boolean

	constructor(parents: Set<AtomRef<V>>, val: V, saved: boolean = false) {
		this.parents = parents;
		this.val = val;
		this.saved = saved;
	}
}

import { List } from 'immutable'

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

type AtomState = 'active'|'taken'|'done'

export class Atom<V> {
	readonly _type = 'Atom'
	readonly parents: List<AtomRef<V>>
	readonly val: V
	readonly weight: number
	readonly state: AtomState

	constructor(parents: List<AtomRef<V>>, val: V, weight: number = 1, state: AtomState = 'active') {
		this.parents = parents;
		this.val = val;
		this.weight = weight;
		this.state = state;
	}

	asRef(): AtomRef<V> {
		return new AtomRef(this);
	}

	with(props: { parents?: List<AtomRef<V>>, val?: V, weight?: number, state?: AtomState }): Atom<V> {
		return new Atom<V>(
			props.parents || this.parents,
			props.val || this.val,
			props.weight !== undefined ? props.weight : this.weight,
			props.state || this.state
		);
	}

	isActive(): boolean {
		return this.state == 'active';
	}

}

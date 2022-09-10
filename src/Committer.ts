import _Monoid from './_Monoid'
import { AtomRef, Atom } from './atoms'
import { OrderedSet, Set } from 'immutable'
import { Observer } from 'rxjs';
import { Lump } from './AtomSpace';

export const $Commit = Symbol('Commit');
export type AtomEmit<V> = readonly [typeof $Commit, AtomRef<V>]

export default class Commit<V> {

  private _refs: OrderedSet<AtomRef<V>>
  private inner: Inner<V>

  constructor(mv: _Monoid<V>, sink: Observer<Lump<V>>, refs?: OrderedSet<AtomRef<V>>) {
    this.inner = new Inner(mv, Set([sink]), Set([this]));
    this._refs = refs || OrderedSet();
  }

  refs() {
    return this._refs;
  }

  addUpstreams(refs: OrderedSet<AtomRef<V>>) {
		this._refs = this._refs
			.subtract(refs.flatMap(r => r.resolve()).flatMap(a => a.parents))
			.union(refs);
  }

  async complete(v: V, w: number = 1): Promise<AtomRef<V>> {
    const newRef = await this.inner.complete(this, this._refs, [v, w]);
    this._refs = OrderedSet([newRef]);
    return newRef;
  }

  abort() {
    this.inner.abort();
  }

  static conjoin<V>(mv: _Monoid<V>, cs: Commit<V>[]) {
    const mi = new MonoidInner(mv);

    const newInner = cs.reduce(
			(ac, c) => mi.add(ac, c.inner), mi.zero)

		if(newInner.state == 'invalid')
			throw Error('Invalid commit combination!');

    const updatables = Set(cs).flatMap(c => c.inner.todo);
    updatables.forEach(c => c.inner = newInner);
  }
}

type State = 'doing'|'done'|'aborted'|'invalid'

class Inner<V> {
  private readonly mv: _Monoid<V>
  readonly waiters: ((r?: AtomRef<V>) => void)[] = []

	private ref: AtomRef<V>|undefined

  value: V
  weight: number
  sinks: Set<Observer<Lump<V>>>
  todo: Set<Commit<V>>
  refs: Set<AtomRef<V>>
  state: State
  
  constructor(mv: _Monoid<V>, sinks: Set<Observer<Lump<V>>>, todo: Set<Commit<V>>, refs?: Set<AtomRef<V>>, state?: State) {
    this.mv = mv;
    this.sinks = sinks;
    this.todo = todo;
    this.refs = refs || Set();
    this.value = mv.zero;
    this.weight = 0;
    this.state = state || 'doing';
  }

  //TODO Committer should lock when it has inidividually completed
  //no more additions possible at that point
  
  complete(commit: Commit<V>, refs: Set<AtomRef<V>>, [v, w]: [V, number]): Promise<AtomRef<V>> {
    this.todo = this.todo.delete(commit);
    this.refs = this.refs.union(refs);
    this.value = this.mv.add(this.value, v);
    this.weight = this.weight + w;

		switch(this.state) {
			case 'aborted': return Promise.reject('Commit aborted!');
			case 'done': return Promise.reject('Commit already complete!');
			case 'invalid': return Promise.reject('Commit invalid!');

			case 'doing':
				if(this.todo.isEmpty()) {     
					//TODO below needs to add weights
          const ref = new Atom<V>(
						this.refs.toList(), //this should be Set surely...
						this.value,
            this.weight
          ).asRef();

          //above, if heads are able to accrue new refs at any time,
          //then capturing them nonchalantly into one atom
          //will risk overcapturing UNLESS committer is locked

          this.sinks.forEach(s => s.next([this.weight, Set([ref])]));

					this.waiters.forEach(fn => fn(ref));

					this.state = 'done';
          this.ref = ref;
          
					return Promise.resolve(ref);
				}
				else {
					return new Promise((resolve, reject) => {
						switch(this.state) {
							case 'done':
								if(!this.ref) throw 'REF SHOULD NEVER BE UNDEFINED';
								return resolve(this.ref);
							case 'aborted':
								return reject('Commit aborted!');
							case 'doing':
								return this.waiters.push((ref) => {
									if(ref) resolve(ref);
									else reject('Commit aborted!');
								});
						}
					});
				}
		}
  }

  abort(): void {
    this.state = 'aborted';
    this.waiters.forEach(fn => fn());
  }
}

const MS: _Monoid<State> = {
  zero: 'doing',
  add(a, b) {
		if(a == 'doing' && b == 'doing')
			return 'doing';
		if(a == 'done' && b == 'done')
			return 'done';
    if(a == 'aborted' && b == 'aborted')
      return 'aborted';
    else
      return 'invalid';
  }
}

class MonoidInner<V> implements _Monoid<Inner<V>> {
  private readonly mv: _Monoid<V>
  
  constructor(mv: _Monoid<V>) {
    this.mv = mv;
    this.zero = new Inner(this.mv, Set(), Set(), Set(), MS.zero);
  }
  
  readonly zero: Inner<V>

  add(a: Inner<V>, b: Inner<V>): Inner<V> {
    return new Inner(
      this.mv,
      a.sinks.merge(b.sinks),
      a.todo.merge(b.todo),
      a.refs.merge(b.refs),
      MS.add(a.state, b.state)
    );
  }
}

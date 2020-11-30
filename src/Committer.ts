import _Monoid from './_Monoid'
import { AtomRef, Atom } from './atoms'
import { Set, List } from 'immutable'
import Head from './Head';

export const $Commit = Symbol('Commit');
export type AtomEmit<V> = readonly [typeof $Commit, AtomRef<V>]

export default class Committer<V> {
  private readonly head: Head<V>
  private inner: Inner<V>

  constructor(mv: _Monoid<V>, h: Head<V>) {
    this.head = h;
    this.inner = new Inner(mv, Set([this]));
  }

  add(rs: List<AtomRef<V>>) {
    this.head.addUpstreams(rs.toSet());
  }

  async complete(v: V): Promise<AtomRef<V>> {
    const ref = await this.inner.complete(this, this.head, v);
    this.head.move(ref);
    return ref;
  }

  abort() {
    this.inner.abort();
  }

  static combine<V>(mv: _Monoid<V>, cs: Committer<V>[]) {
    const mi = new MonoidInner(mv);

    const newInner = cs.reduce(
			(ac, c) => mi.add(ac, c.inner), mi.zero)

		if(newInner.state == 'invalid')
			throw Error('Invalid commit combination!');

    cs.forEach(c => c.inner = newInner);
  }
}

type State = 'doing'|'done'|'aborted'|'invalid'

class Inner<V> {
  private readonly mv: _Monoid<V>
  readonly waiters: ((r?: AtomRef<V>) => void)[] = []

	private ref: AtomRef<V>|undefined

  value: V
  todo: Set<Committer<V>>
  heads: Set<Head<V>>
  state: State
  
  constructor(mv: _Monoid<V>, todo: Set<Committer<V>>, heads?: Set<Head<V>>, state?: State) {
    this.mv = mv;
    this.todo = todo;
    this.heads = heads || Set();
    this.value = mv.zero;
    this.state = state || 'doing';
  }
  
  complete(commit: Committer<V>, head: Head<V>, v: V): Promise<AtomRef<V>> {
    this.todo = this.todo.delete(commit);
    this.heads = this.heads.add(head);
    this.value = this.mv.add(this.value, v);

		switch(this.state) {
			case 'aborted': return Promise.reject('Commit aborted!');
			case 'done': return Promise.reject('Commit already complete!');
			case 'invalid': return Promise.reject('Commit invalid!');

			case 'doing':
				if(this.todo.isEmpty()) {     
					//TODO below needs to add weights
          const ref = new Atom<V>(
						this.heads.flatMap(h => h.refs()).toList(),
						this.value
          ).asRef();

          this.heads
            .map(h => h.sink)
            .forEach(s => s.next([1, ref])); //TODO add weights here!!!

					this.waiters.forEach(fn => fn(ref));

					this.state = 'done';
          this.ref = ref;
          
					return Promise.resolve(ref);
				}
				else {
					return new Promise((resolve, reject) => {
						switch(this.state) {
							case 'done':
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
    this.zero = new Inner(this.mv, Set(), Set(), MS.zero);
  }
  
  readonly zero: Inner<V>

  add(a: Inner<V>, b: Inner<V>): Inner<V> {
    return new Inner(
      this.mv,
      a.todo.merge(b.todo),
      a.heads.merge(b.heads),
      MS.add(a.state, b.state)
    );
  }
}

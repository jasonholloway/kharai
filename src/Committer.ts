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

  //if we were to add blobs
  //they would be added to the head as they were pulled in
  //wouldn't they be machines then???
  //items of binary data would be given
  //simple default behaviour
  //the store would detect the binary data
  //and return ['blob', Buffer]
  //which would always be receptive to reads and writes
  //in a single-threaded fashion
  //the store would also compress on final save

  add(rs: List<AtomRef<V>>) {
    this.head.addUpstreams(rs.toSet());
  }

  async complete(v: V, w: number = 1): Promise<AtomRef<V>> {
    const ref = await this.inner.complete(this, this.head, [v, w]);
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
  todo: Set<Committer<V>>
  heads: Set<Head<V>>
  state: State
  
  constructor(mv: _Monoid<V>, todo: Set<Committer<V>>, heads?: Set<Head<V>>, state?: State) {
    this.mv = mv;
    this.todo = todo;
    this.heads = heads || Set();
    this.value = mv.zero;
    this.weight = 0;
    this.state = state || 'doing';
  }
  
  complete(commit: Committer<V>, head: Head<V>, [v, w]: [V, number]): Promise<AtomRef<V>> {
    this.todo = this.todo.delete(commit);
    this.heads = this.heads.add(head);
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
						this.heads.flatMap(h => h.refs()).toList(),
						this.value,
            this.weight
          ).asRef();

          //BELOW: the weights fan out here I think
          //and we get duplicated commits
          //and duplicated weights
          //
          //this is because heads are the given interface
          //which we have to use to write atoms
          //but this means we have to go via multiple heads
          //
          //on the one hand, having a Head 
          //allows nice unilateral atom botherment
          //but also this fails when we have many
          //
          //a Head is kind of like a Committer
          //or - a Head can be thought of as outside a Committer, a wrapper
          //the Committer posts to commit$
          //
          //the Head is basically a holder of a Committer
          //and the Committer becomes less stateful
          //the Committer takes atoms, returns atoms
          //and its caller has responsibility for threading these sets of atoms along
          //
          //this responsibility can belong to the Head
          //so we're inverting the order:
          //the Head owns, wraps, manages the Committer
          //in fact it doesn't do much, except that it is a stateful handle
          //
          //it will have its own commit/abort methods
          //when it moves forwards, it will always have a Committer on the go
          //
          //this will all serve to dedupe the commits and weights we're
          //putting down the spout
          //
          //also, more far out, is the desire to serialize saves
          //into the same temporal log
          //
          //though - logs are per-machine
          //and commits are machine-independent
          //so it is inescable unless we serialize everything

          this.heads
            .forEach(h => h.sink.next([this.weight, ref])); //TODO add weights here!!!

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

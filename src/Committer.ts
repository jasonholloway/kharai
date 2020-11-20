import _Monoid from './_Monoid'
import { Head } from'./AtomSpace'
import { AtomRef, Atom } from './atoms'
import { Set } from 'immutable'

export const $Commit = Symbol('Commit');
export type AtomEmit<V> = readonly [typeof $Commit, AtomRef<V>]

export default class Commit<V> {
	private readonly head: Head<V>
	private inner: Inner<V>

	constructor(mv: _Monoid<V>, h: Head<V>) {
		this.head = h;
		this.inner = new Inner(mv, Set([this]));
	}

	add(rs: Set<AtomRef<V>>) {
		this.head.addUpstreams(rs);
	}

	//and abandon?

	async complete(v: V): Promise<AtomRef<V>> {
		const ref = await this.inner.complete(this, this.head, v);
		this.head.move(ref);
		return ref;
	}

	static combine<V>(mv: _Monoid<V>, cs: Commit<V>[]) {
		const mi = new MonoidInner(mv);
		const newInner = cs.reduce((ac, c) => mi.add(ac, c.inner), mi.zero)
		cs.forEach(c => c.inner = newInner);
	}
}

class Inner<V> {
	private readonly mv: _Monoid<V>
	readonly waiters: ((r: AtomRef<V>) => void)[] = []

	value: V
	todo: Set<Commit<V>>
	heads: Set<Head<V>>
	done: boolean;
	
	constructor(mv: _Monoid<V>, todo: Set<Commit<V>>, heads?: Set<Head<V>>, done?: boolean) {
		this.mv = mv;
		this.todo = todo;
		this.heads = heads || Set();
		this.value = mv.zero;
		this.done = done || false;
	}
	
	complete(commit: Commit<V>, head: Head<V>, v: V): Promise<AtomRef<V>> {
		this.todo = this.todo.delete(commit);
		this.heads = this.heads.add(head);
		this.value = this.mv.add(this.value, v);
		
		if(this.todo.isEmpty()) {			
			const atom = new Atom(this.heads.flatMap(h => h.refs()), this.value);
			const ref = new AtomRef(atom);

			this.waiters.forEach(fn => fn(ref));
			this.done = true;
			return Promise.resolve(ref);
		}
		else {
			return new Promise((resolve) => {
				if(this.done) resolve();
				else this.waiters.push(resolve);
			});
		}
	}
}

class MonoidInner<V> implements _Monoid<Inner<V>> {
	private readonly mv: _Monoid<V>
	
	constructor(mv: _Monoid<V>) {
		this.mv = mv;
		this.zero = new Inner(this.mv, Set(), Set());
	}
	
  readonly zero: Inner<V>

	add(a: Inner<V>, b: Inner<V>): Inner<V> {
		return new Inner(
			this.mv,
			a.todo.merge(b.todo),
			a.heads.merge(b.heads),
			a.done && b.done
		);
  }
}

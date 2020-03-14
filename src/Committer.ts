import _Monoid from './_Monoid'
import { Head } from'./AtomSpace'
import { AtomRef } from '../src/atoms'
import { Set } from 'immutable'
import { Observer } from 'rxjs/internal/types'

export const $Commit = Symbol('Commit');
export type AtomEmit<V> = readonly [typeof $Commit, AtomRef<V>]

export default class Commit<V> {
	private inner: Inner<V>

	constructor(mv: _Monoid<V>, h: Head<V>, sink: Observer<AtomRef<V>>) {
		this.inner = new Inner(mv, Set([h]), Set([sink]), Set([this]));
	}

	complete(v: V): Promise<AtomRef<V>> {
		return this.inner.complete(this, v);
	}

	static combine<V>(mv: _Monoid<V>, cs: Commit<V>[]) {
		const mi = new MonoidInner(mv);
		const newInner = cs.reduce((ac, c) => mi.add(ac, c.inner), mi.zero)
		cs.forEach(c => c.inner = newInner);
	}
}


class Inner<V> {
	private readonly mv: _Monoid<V>
	readonly heads: Set<Head<V>>
	readonly waiters: (() => void)[] = []
	readonly sinks: Set<Observer<AtomRef<V>>>
	private done = false;

	value: V
	refs: Set<Commit<V>>
	
	constructor(mv: _Monoid<V>, heads: Set<Head<V>>, sinks: Set<Observer<AtomRef<V>>>, refs: Set<Commit<V>>) {
		this.mv = mv;
		this.heads = heads;
		this.sinks = sinks;
		this.value = mv.zero;
		this.refs = refs;
	}

	complete(commit: Commit<V>, v: V): Promise<AtomRef<V>> {
		this.value = this.mv.add(this.value, v);

		this.refs = this.refs.delete(commit);
		if(this.refs.isEmpty()) {			
			const ref = Head.conjoin([...this.heads], this.value);
			this.sinks.forEach(s => s.next(ref));

			this.waiters.forEach(fn => fn());
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
		this.zero = new Inner(this.mv, Set(), Set(), Set());
	}
	
  readonly zero: Inner<V>

	add(a: Inner<V>, b: Inner<V>): Inner<V> {
		return new Inner(
			this.mv,
			a.heads.merge(b.heads),
			a.sinks.merge(b.sinks),
			a.refs.merge(b.refs)
		);
  }
}

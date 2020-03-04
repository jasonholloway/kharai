import _Monoid from './_Monoid'
import { Head } from'./AtomSpace'


export default class Commit<V> {
	private inner: Inner<V>

	constructor(mv: _Monoid<V>, h: Head<V>) {
		this.inner = new Inner(mv, [h], 1);
	}

	complete(v: V): Promise<void> {
		return this.inner.complete(v);
	}

	static join<V>(mv: _Monoid<V>, cs: Commit<V>[]) {
		const mi = new MonoidInner(mv);
		const newInner = cs.reduce((ac, c) => mi.add(ac, c.inner), mi.zero)
		cs.forEach(c => c.inner = newInner);
	}
}


class Inner<V> {
	private readonly mv: _Monoid<V>
	readonly heads: Head<V>[]
	readonly waiters: (() => void)[] = []
	private done = false;

	value: V
	refCount: number
	
	constructor(mv: _Monoid<V>, heads: Head<V>[], refCount: number) {
		this.mv = mv;
		this.heads = heads;
		this.value = mv.zero;
		this.refCount = refCount;
	}

	complete(v: V): Promise<void> {
		this.value = this.mv.add(this.value, v);
		
		if(!(--this.refCount)) {
			Head.conjoin(this.heads, this.value);

			this.waiters.forEach(fn => fn());
			this.done = true;
			return Promise.resolve();
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
		this.zero = new Inner(this.mv, [], 0);
	}
	
  readonly zero: Inner<V>

	add(a: Inner<V>, b: Inner<V>): Inner<V> {
		return new Inner(this.mv, [...a.heads, ...b.heads], a.refCount + b.refCount);
  }
}

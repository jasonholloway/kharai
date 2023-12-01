import { isPromise } from 'util/types';
import CancellablePromise from './CancellablePromise'

export namespace Preemptable {
  export function lift<A>(a: A|CancellablePromise<A>): Preemptable<A> {
    if(a instanceof CancellablePromise) {
      return new Continuable(a);
    }
    else {
      return new Value(a);
    }
  }
}

export interface Preemptable<A> {
  preempt(): readonly [true, A] | readonly [false, () => CancellablePromise<A>]
  map<B>(fn: (a:A) => B): Preemptable<B>
  flatMap<B>(fn: ((a:A)=>Preemptable<B>)): Preemptable<B>
  promise(): CancellablePromise<A>
}

class Value<A> implements Preemptable<A> {
  readonly value: A

  constructor(value: A) {
    this.value = value;
  }

  preempt(): [true, A] {
    return [true, this.value];
  }
  
  flatMap<B>(fn: (a: A) => Preemptable<B>): Preemptable<B> {
    return fn(this.value);
  }

  map<B>(fn: (a: A) => B): Preemptable<B> {
    return this.flatMap(a => Preemptable.lift(fn(a)));
  }

  promise(): CancellablePromise<A> {
    return new CancellablePromise(resolve => resolve(this.value));
  }
}

class Continuable<A> implements Preemptable<A> {
  private _inner: CancellablePromise<A>;

  constructor(inner: CancellablePromise<A>) {
    this._inner = inner;
  }

  preempt(): [false, () => CancellablePromise<A>] {
    return [false, () => this._inner];
  }

  flatMap<B>(fn: (a: A) => Preemptable<B>): Preemptable<B> {
    return new Continuable(this._inner.then(a => fn(a).promise()));
  }

  map<B>(fn: (a: A) => B): Preemptable<B> {
    return this.flatMap(a => Preemptable.lift(fn(a)));
  }

  promise(): CancellablePromise<A> {
    return this._inner;
  }
}

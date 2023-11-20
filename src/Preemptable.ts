import CancellablePromise, { CancellableFn } from './CancellablePromise'

export namespace Preemptable {
  export function lift<A>(a: A): Preemptable<A> {
    return new Value(a);
  }

  export function liftFn<A>(fn: (()=>Promise<A>)): Preemptable<A> {
    return new Continuable((resolve, reject, onCancel) => { fn().then(resolve).catch(onCancel) })
  }

  export function continuable<A>(fn: CancellableFn<A>): Preemptable<A> {
    return new Continuable(fn);
  }
}

export interface Preemptable<A> {
  preempt(): readonly [true, A] | readonly [false, () => CancellablePromise<A>]
  map<B>(fn: (a:A) => B): Preemptable<B>
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
  
  map<B>(fn: (a: A) => B): Value<B> {
    return new Value(fn(this.value));
  }

  promise(): CancellablePromise<A> {
    return new CancellablePromise(resolve => resolve(this.value));
  }
}

class Continuable<A> implements Preemptable<A> {
	run: CancellableFn<A>
  private _promise: CancellablePromise<A>|undefined

  constructor(fn: CancellableFn<A>) {
    this.run = fn;
  }

  preempt(): [false, () => CancellablePromise<A>] {
    return [false, () => this.promise()];
  }
  
  map<B>(fn: (a: A) => B): Continuable<B> {
    return new Continuable((resolve, reject, onCancel) => {
      this.run(a =>
        resolve(
          (isPromiseLike(a) ? a.then(fn) : fn(a))),
          reject,
          onCancel
        );
			});
  }

  promise(): CancellablePromise<A> {
    if(this._promise) {
      return this._promise;
    }
    else {
      return this._promise = new CancellablePromise(this.run);
    }
  }
}

function isPromiseLike<V>(v: any): v is PromiseLike<V> {
  return v && v.then && typeof v.then === 'function';
}

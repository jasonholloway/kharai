import CancellablePromise, { Cancellable } from './CancellablePromise'

export namespace Preemptable {
  function fromValue<A>(value: A) {
    return new PreemptableValue(value);
  }

  function fromPromise<A>(
		fn: (resolve: (v:A|CancellablePromise<A>|PromiseLike<A>)=>void, reject: (r:any)=>void) => void,
		upstreams?: Cancellable[]
  )
  {
    return new PreemptablePromise(fn, upstreams);
  }
}

export interface Preemptable<A> extends Promise<A>, Cancellable {
  preempt(): [true,A]|[false]
  map<B>(fn: (a:A) => B): Preemptable<B>
}

class PreemptableValue<A> extends CancellablePromise<A> implements Preemptable<A> {
  readonly value: A

  constructor(value: A) {
    super((resolve) => resolve(value));
    this.value = value;
  }

  preempt(): [true, A] {
    return [true, this.value];
  }
  
  map<B>(fn: (a: A) => B): PreemptableValue<B> {
    return new PreemptableValue(fn(this.value));
  }
}

class PreemptablePromise<A> extends CancellablePromise<A> implements Preemptable<A> {

  constructor(
		fn: (resolve: (v:A|CancellablePromise<A>|PromiseLike<A>)=>void, reject: (r:any)=>void) => void,
		upstreams?: Cancellable[]
	) {
    super(fn, upstreams);
  }

  preempt(): [false] {
    return [false];
  }
  
  map<B>(fn: (a: A) => B): PreemptablePromise<B> {
    return new PreemptablePromise((resolve, reject) => {
				this
					.then(a => resolve(fn(a)))
					.catch(reject);
			},
			this._upstreams);
  }
}

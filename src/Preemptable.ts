import CancellablePromise, { Cancellable } from './CancellablePromise'
import { Observable } from 'rxjs';

export namespace Preemptable {
  export function fromValue<A>(value: A): Preemptable<A> {
    return new PreemptableValue(value);
  }

  export function fromPromise<A>(
		fn: (resolve: (v:A|PromiseLike<A>)=>void, reject: (r:any)=>void, onCancel: (h:()=>void)=>void ) => void,
		upstreams?: Cancellable[]
  ): Preemptable<A>
  {
    return new PreemptablePromise(fn, upstreams);
  }
}

export interface Preemptable<A> extends Promise<A>, Cancellable {
  preempt(): [true,A]|[false]
  map<B>(fn: (a:A) => B): Preemptable<B>
	cancelOn(kill$: Observable<any>): Promise<A>
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
		fn: (resolve: (v:A|CancellablePromise<A>|PromiseLike<A>)=>void, reject: (r:any)=>void, onCancel: (h:()=>void)=>void ) => void,
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

import CancellablePromise, { Cancellable, CancellableFn } from './CancellablePromise'

export namespace Preemptable {
  export function lift<A>(a: A): Preemptable<A> {
    return new Value(a);
  }

  export function liftFn<A>(fn: (()=>Promise<A>)): Preemptable<A> {
    return new Continuable((resolve, reject) => { fn().then(resolve).catch(reject) })
  }

  export function continuable<A>(fn: CancellableFn<A>): Preemptable<A> {
    return new Continuable(fn);
  }
}

export interface Preemptable<A> {
  preempt(): readonly [true, A] | readonly [false, () => CancellablePromise<A>]
  bind<B>(fn: ((a:A)=>Preemptable<B>)): Preemptable<B>
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
  
  bind<B>(fn: (a: A) => Preemptable<B>): Preemptable<B> {
    return fn(this.value);
  }

  map<B>(fn: (a: A) => B): Preemptable<B> {
    return this.bind(a => Preemptable.lift(fn(a)));
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

  bind<B>(fn: (a: A) => Preemptable<B>): Preemptable<B> {
    return new Continuable((resolve, reject, onCancel) => {
      let cancelled: boolean = false;
      onCancel(() => cancelled = true);
      
      try {
        this.run(
          a => {
            if(cancelled) reject('CANCELLED');
            else {
              try {
                fn(a).promise()
                  .then(b => {
                    if(cancelled) reject('CANCELLED');
                    else resolve(b);
                  })
                  .catch(reject);
              }
              catch(e) {
                reject(e);
              }
            }
          },
          reject,
          onCancel
        );
      }
      catch(e) {
        reject(e);
      }
    });
  }

  //TODO proper testing of this stuff...
  //TODO onCancel isn't propagating properly above
  //TODO Cancellable should do more, leaving less to do here

  map<B>(fn: (a: A) => B): Preemptable<B> {
    return this.bind(a => Preemptable.lift(fn(a)));
  }

  promise(upstreams?: Cancellable[]): CancellablePromise<A> {
    if(this._promise) {
      return this._promise;
    }
    else {
      return this._promise = new CancellablePromise(this.run, upstreams ?? []);
    }
  }
}

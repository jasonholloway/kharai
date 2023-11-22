import CancellablePromise, { Cancellable } from "./CancellablePromise";
import { isPromise } from "./util";

export class Attempt<A> implements Promise<[A]|false>, Cancellable {

  private _inner: CancellablePromise<[A]|false>;
  [Symbol.toStringTag] = 'Attempt';

  constructor(inner: CancellablePromise<[A]|false>) {
    this._inner = inner;
  }

  map<B>(fn: (a:A)=>B): Attempt<B> {
    return new Attempt<B>(
      this._inner.then(ar => {
        if(ar) return [fn(ar[0])]; 
        else return false;
      })
    );
  }

  flatMap<B>(fn: (a:A)=>Attempt<B>): Attempt<B> {
    //todo should be able to squeeze in other promises here
    
    return new Attempt(
      this._inner.then(ar => {
        if(ar) {
          const b = fn(ar[0]);
          return b;
        }
        else return false;
      })
    );
  }

  then<B = [A]|false, C = never>(onfulfilled?: ((value: [A]|false) => B|PromiseLike<B>) | undefined | null, onrejected?: ((reason: any) => C|PromiseLike<C>) | undefined | null): CancellablePromise<B|C> {
    return this._inner.then(onfulfilled, onrejected);
  }

  catch<C = never>(onrejected?: ((reason: any) => C|PromiseLike<C>) | undefined | null): CancellablePromise<[A]|false|C> {
    return this._inner.catch(onrejected);
  }

  finally(onfinally?: (() => void) | null | undefined): Attempt<A> {
    const inner2 = this._inner.finally(onfinally);
    return new Attempt(inner2);
  }

  private static AssertErr: string = 'Assertion on failed attempt';

  ok(): CancellablePromise<A> {
    return this._inner.then(x => {
      if(x) {
        return x[0];
      }
      else {
        throw Attempt.AssertErr;
      }
    });
  }

  else<B>(fallback: B): CancellablePromise<A|B> {
    return this._inner.then(x => {
      if(x) {
        return x[0];
      }
      else {
        return fallback;
      }
    });
  }

  cancel(): void | PromiseLike<void> {
    return this._inner.cancel();
  }
  
  static succeed<V>(v: V): Attempt<V> {
    return new Attempt(CancellablePromise.create(resolve => resolve([v])));
  }

  static fail<V = never>(): Attempt<V> {
    return new Attempt(CancellablePromise.create(resolve => resolve(false)));
  }

  
}

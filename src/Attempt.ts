import CancellablePromise, { Cancellable } from "./CancellablePromise";
import { isPromise } from "./util";

export interface Attempt<A> extends Promise<A>, Cancellable {
  assert(): CancellablePromise<A>
  orElse<B>(b: B): CancellablePromise<A|B>
  then<B=A, C=never>(onfulfilled?: ((a:A) => B|Promise<B>) | null | undefined, onrejected?: ((reason: any) => C|Promise<C>) | null | undefined): Attempt<B|C>;
  finally(onfinally?: (() => void) | null | undefined): Attempt<A>;
}

export class AttemptImpl<A> implements Attempt<A> {

  private _inner: CancellablePromise<[A]|false>;
  [Symbol.toStringTag] = 'AttemptImpl';

  constructor(inner: CancellablePromise<[A]|false>) {
    this._inner = inner;
  }

  then<B=A, C=never>(onfulfilled?: ((a:A) => B|Promise<B>) | null | undefined, onrejected?: ((reason: any) => C|Promise<C>) | null | undefined): Attempt<B|C> {
    const inner2 = onfulfilled
      ? this._inner
          .then<[B]|false>(y => {
            if(!y) return false;

            const r = onfulfilled(y[0]);
            
            if(isPromise(r)) { //todo should absorb Attempts here...
              return r.then(x => [x] as [B]);
            }
            else {
              return [r] as [B];
            }
          })
      : <CancellablePromise<[B]|false>>this._inner;

    const inner3 = onrejected
      ? inner2
        .catch(err => {
          const r = onrejected(err);

          if(isPromise(r)) { //todo should absorb Attempts here...
            return r.then(x => [x] as [B|C]);
          }
          else {
            return [r] as [B|C];
          }
        })
      : <CancellablePromise<[B|C]|false>>inner2;

    return new AttemptImpl(inner3);
  }

  catch<C=never>(onrejected?: ((reason: any) => C|PromiseLike<C>) | null | undefined): Attempt<A|C> {
    throw new Error("Method not implemented.");
  }

  finally(onfinally?: (() => void) | null | undefined): Attempt<A> {
    const inner2 = this._inner.finally(onfinally);
    return new AttemptImpl(inner2);
  }

  private static AssertErr: string = 'Assertion on failed attempt';

  assert(): CancellablePromise<A> {
    return this._inner.then(x => {
      if(x) {
        return x[0];
      }
      else {
        throw AttemptImpl.AssertErr;
      }
    });
  }

  orElse<B>(fallback: B): CancellablePromise<A|B> {
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
    return new AttemptImpl(CancellablePromise.create(resolve => resolve([v])));
  }

  static fail<V = never>(): Attempt<V> {
    return new AttemptImpl(CancellablePromise.create(resolve => resolve(false)));
  }

  
}

import { Observable } from "rxjs";
import { take } from "rxjs/operators";

type Hook = ()=>void|PromiseLike<void>; //

export interface Cancellable { cancel: Hook };

export type CancellableFn<A> = (resolve: (v:A|Promise<A>)=>void, reject: (r:any)=>void, onCancel: (h:Hook)=>void) => void;

export default class CancellablePromise<A> implements Promise<A>, Cancellable {

  private readonly _spawn: <B>(fn: CancellableFn<B>) => CancellablePromise<B>;
  private readonly _cancel: () => Promise<void>;
  private readonly _inner: Promise<A>;

  constructor(setHandlers: CancellableFn<A>, hooks: Hook[] = []) {
    
    let innerResolve: ((v:A|PromiseLike<A>)=>void) = undefined!;
    let innerReject: ((r:any)=>void) = undefined!;

    this._inner = new Promise<A>((resolve, reject) => {
      innerResolve = resolve;
      innerReject = reject;
    });

    let resolving: boolean = false;
    let cancelling: Promise<void>|false = false;
    let cancelled: boolean = false;
    let complete: boolean = false;

    this._spawn = fn => new CancellablePromise(fn, [() => this.cancel()]);

    this._cancel = () => {
      if(!complete && !cancelling) {
        this.log(`calling ${hooks.length} hooks`)

        cancelling = Promise.resolve(); //just to have it set before hooks are called
        
        cancelling = Promise
          .all(hooks.map(async (hook, i) => {
            this.log(`calling hook #${i}`);
            await (hook() ?? Promise.resolve());
          }))
          .finally(() => this.log('all hooks called'))
          .then(_ => this._inner.catch(_ => {}).then())
      }

      return cancelling || Promise.resolve();
    };

    const tryCompleteCancel = (makeError: ()=>Error) => {
      if(cancelling && !cancelled) {
        this.log('cancelled')
        cancelled = true;
        
        innerReject(makeError());

        return true;
      }
      else return false;
    };

    const onResolve = (a: A) => {
      if(!tryCompleteCancel(() => new CancelledError())) {
        innerResolve(a);
        complete = true;
      }
    };

    const onReject = (err: unknown) => {
      if(!complete) {
        complete = true;

        const makeError = () => //this is horrid; shouldn't be insisting on error type here
          err instanceof CancelledError ? err
          : err instanceof Error ? new CancellingError(err)
          : typeof err === 'string' ? new CancellingError(Error(err))
          : Error('Some strange error')
        ;

        if(!tryCompleteCancel(makeError)) {
          innerReject(err);
        } 
      }
    };
      
    setHandlers(
      (resolved) => {
        if(!resolving) {
          resolving = true;
          
          const r = resolved;
          if(isCancellable(r)) {
            hooks.push(() => r.cancel());
          }

          if(isPromise(r)) {
            r.then(onResolve).catch(onReject);
          }
          else {
            onResolve(r);
          }
        }
      },
      onReject,
      hook => hooks.push(() => {
        if(!resolving) hook();
      })
    );
  }

  cancel(): Promise<void> {
    return this._cancel();
  }

  [Symbol.toStringTag] = 'CancellablePromise';

  private _mapInner<B>(fn: (p: Promise<A>, wrap: (orig: (a:A)=>B|PromiseLike<B>) => ((a:A)=>B|PromiseLike<B>) ) => Promise<B>) {
    return this._spawn<B>((resolve, reject, addHook) => {

      const wrap = (orig: (a:A)=>B|PromiseLike<B>) =>
        (a: A) => {
          const r = orig(a);

          if(isCancellable(r)) {
            addHook(() => r.cancel());
          }

          return r;
        };
      
      fn(this._inner, wrap).then(resolve).catch(reject);
    });
  }

  then<TResult1 = A, TResult2 = never>(
    onfulfilled?: ((value: A) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): CancellablePromise<TResult1 | TResult2>
  {
    return this._mapInner((p, wrap) =>
      onfulfilled
      ? p.then(
          wrap(onfulfilled),
          onrejected ? wrap(onrejected) : undefined
        )
      : p.then());
  }

  catch<TResult = never>(onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null): CancellablePromise<A | TResult> {
    return this._mapInner((p, wrap) =>
      p.catch(
        onrejected
        ? wrap(onrejected)
        : undefined
      )
    );
  }

  finally(fn?: (() => void) | undefined | null): CancellablePromise<A> {
    return this._mapInner(p => p.finally(fn));
  }

	cancelOn(kill$: Observable<any>): CancellablePromise<A> {
    //TODO NEEDS REWORK!!! TODO TODO TODO
		const sub = kill$.pipe(take(1)).subscribe(() => this.cancel());
		return this.finally(() => sub.unsubscribe());
	}


  static create<V>(
    fn: (resolve: (v:V|Promise<V>)=>void, reject: (r:any)=>void, addCancel: (h:Hook)=>void) => void
  ): CancellablePromise<V>
  {
    return new CancellablePromise(fn);
  }

  static all<T>(promises: Iterable<PromiseLike<T>>): CancellablePromise<Awaited<T>[]> {
    const ps = [...promises];

    const allHooks = ps
      .flatMap<Hook>(p => p instanceof CancellablePromise ? [() => p.cancel()] : []);

    return new CancellablePromise((resolve, reject) => {
      Promise.all(ps)
        .then(resolve)
        .catch(reject);
    }, allHooks);
  }


  // private static _nextId = 0;
  // private readonly _id = CancellablePromise<A>._nextId++;
  private log(...parts: unknown[]) {
    // console.log(`[${this._id}]`, ...parts);
  }
}

export class CancelledError extends Error {
	constructor() {
		super('Cancelled')
		this.name = 'CancelledError'
	}
}

export class CancellingError<Inner extends Error> extends Error {
	constructor(inner: Inner) {
		super(`On cancel, got ${inner.message}`)
		this.name = `CancellingError<${inner.name}>`
	}
}


function isCancellable(v: any): v is Cancellable {
  return v && v.cancel && typeof v.cancel === 'function';
}

function isPromise(v: any): v is Promise<unknown> {
  return v && (
       v.then && typeof v.then === 'function'
    && v.catch && typeof v.catch === 'function'
  );
}

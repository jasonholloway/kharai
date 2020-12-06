import { Observable } from "rxjs/internal/Observable";

export type Cancellable = { cancel(): void }

export default class CancellablePromise<A> extends Promise<A> implements Cancellable {

  protected readonly _upstreams: Cancellable[]

  constructor(
		fn: (resolve: (v:A|CancellablePromise<A>|PromiseLike<A>)=>void, reject: (r:any)=>void, onCancel: (h: ()=>void) => void) => void,
		upstreams?: Cancellable[]
	) {
    let cancelled = false;
    const hooks: (()=>void)[] = [];
		let _reject: ((r:any)=>void)|undefined = undefined;
    
    super((resolve, reject) => {
      _reject = reject;
      
			fn(
				(v) => {
					if(v instanceof CancellablePromise) {
						this._upstreams.push(v);
					}

					return resolve(v);
				},
				reject,
        h => hooks.push(h)
      );
    });

    this._upstreams = [
      ...(upstreams || []),
      {
        cancel() {
          if(!cancelled) {
            cancelled = true;
            try {
              hooks.forEach(h => h());
              if(_reject) _reject(new CancelledError())
            }
            catch(e) {
              if(_reject) _reject(e);
              else throw e;
            }
          }
        }
      }
    ];
  }

  cancel() {
    this._upstreams.forEach(u => u.cancel());
  }

  map<B>(fn: (a:A) => B): CancellablePromise<B> {
    return new CancellablePromise((resolve, reject) => {
				this
					.then(a => resolve(fn(a)))
					.catch(reject);
			},
			this._upstreams);
  }

	cancelOn(kill$: Observable<any>): Promise<A> {
		const sub = kill$.subscribe(() => this.cancel());
		return this.finally(() => sub.unsubscribe());
	}

  static create<V>(
    fn: (resolve: (v:V|PromiseLike<V>)=>void, reject: (r:any)=>void, addCancel: (h: ()=>void) => void) => void
  ): CancellablePromise<V>
  {
    return new CancellablePromise(fn);
  }
}

export class CancelledError extends Error {
	constructor() {
		super('Cancelled')
		this.name = 'CancelledError'
	}
}

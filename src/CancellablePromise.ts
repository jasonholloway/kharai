import { Observable } from "rxjs/internal/Observable";

type Cancellable = { cancel(): void }

export default class CancellablePromise<A> extends Promise<A> implements Cancellable {

  private readonly _upstreams: Cancellable[]

  constructor(
		fn: (resolve: (v:A|CancellablePromise<A>|PromiseLike<A>)=>void, reject: (r:any)=>void) => void,
		upstreams?: Cancellable[]
	) {
    super((resolve, reject) =>
			fn(
				(v) => {
					if(v instanceof CancellablePromise) {
						this._upstreams.push(v);
					}

					return resolve(v);
				},
				reject
			));

    this._upstreams = upstreams || [];
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
  ): CancellablePromise<V> {
    let _cancelled = false;
		let _reject: ((r:any)=>void)|undefined = undefined;
    const _hooks: (()=>void)[] = [];
    
    return new CancellablePromise<V>(
      (resolve, reject) => {
				_reject = reject;
        fn(resolve, reject, hook => _hooks.push(hook))
      },
      [{
        cancel() {
          if(!_cancelled) {
            _cancelled = true;
            _hooks.forEach(h => h());
						if(_reject) _reject(new CancelledError())
          }
        }
      }]
    );
  }
}

export class CancelledError extends Error {
	constructor() {
		super('Cancelled')
		this.name = 'CancelledError'
	}
}

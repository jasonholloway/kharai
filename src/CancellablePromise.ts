
type Cancellable = { cancel(): void }

export default class CancellablePromise<A> extends Promise<A> implements Cancellable {

  private readonly _upstream: Cancellable|undefined;

  constructor(
		fn: (resolve: (v:A)=>void, reject: (r:any)=>void) => void,
		upstream?: Cancellable
	) {
    super(fn);
    this._upstream = upstream;
  }

  cancel() {
    this._upstream?.cancel();
  }

  map<B>(fn: (a:A) => B): CancellablePromise<B> {
    return new CancellablePromise((resolve, reject) => {
      this
        .then(a => resolve(fn(a)))
        .catch(reject);
    }, this);
  }

  static create<V>(
    fn: (resolve: (v:V)=>void, reject: (r:any)=>void, addCancel: (h: ()=>void) => void) => void
  ): CancellablePromise<V> {
    let _cancelled = false;
		let _reject: ((r:any)=>void)|undefined = undefined;
    const _hooks: (()=>void)[] = [];
    
    return new CancellablePromise<V>(
      (resolve, reject) => {
				_reject = reject;
        fn(resolve, reject, hook => _hooks.push(hook))
      },
      {
        cancel() {
          if(!_cancelled) {
            _cancelled = true;
            _hooks.forEach(h => h());
						if(_reject) _reject(Error('Cancelled'))
          }
        }
      }
    );
  }
}

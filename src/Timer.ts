import { Set } from 'immutable'
import { Observable } from 'rxjs';
import CancellablePromise, { CancelledError } from './CancellablePromise';
import { isDate } from 'node:util/types';

export interface Timer {
  schedule<V>(when: number|Date, fn: ()=>V): CancellablePromise<V>
}

export class RealTimer implements Timer {
  private active: boolean;
  private timeouts: Set<NodeJS.Timeout>;
  private kill$: Observable<unknown>;

  constructor(kill$: Observable<unknown>) {
    this.active = true;
    this.timeouts = Set();
    this.kill$ = kill$;

    kill$.subscribe(() => {
      this.active = false;
      this.timeouts.forEach(clearTimeout);
    });
  }
  
  schedule<V>(when: number|Date, fn: ()=>V): CancellablePromise<V> {
    return new CancellablePromise<V>(
      (resolve, reject, onCancel) => {
        const delayMs = Math.max(
          isDate(when)
            ? when.valueOf() - Date.now()
            : when,
          0);

        const t = setTimeout(() => {
          if(this.active) {
            try {
              const result = fn();
              resolve(result);
            }
            catch(e) {
              reject(e);
            }
          }
          else {
            reject(Error('RealTimer deactivated'));
          }
        }, delayMs);

        onCancel(() => {
          clearTimeout(t)
          reject(new CancelledError());
        });

        this.timeouts = this.timeouts.add(t);
      }).cancelOn(this.kill$);
  }
}


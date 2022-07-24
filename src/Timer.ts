import { Set } from 'immutable'
import { Observable } from 'rxjs';
import CancellablePromise from './CancellablePromise';

export interface Timer {
  schedule<V>(when: Date, fn: ()=>V): Promise<V>
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
  
  schedule<V>(when: Date, fn: ()=>V): Promise<V> {
    return new CancellablePromise<V>(
      (resolve, reject) => {
        const nowMs = Date.now();
        const dueMs = when.valueOf();
        const delayMs = Math.max(dueMs - nowMs, 0);

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

        this.timeouts = this.timeouts.add(t);
    }).cancelOn(this.kill$);
  }
}


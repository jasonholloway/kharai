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
        const now = Date.now();
        const start = when.valueOf();

        let delay = (start - now);
        if(delay <= 0) delay = 0;

        console.log('schedule', now, start, delay)

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
        }, delay);

        this.timeouts = this.timeouts.add(t);
    }).cancelOn(this.kill$);
  }
}


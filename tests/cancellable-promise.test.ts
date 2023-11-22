import { describe, expect, it } from '@jest/globals';
import CancellablePromise, { CancelledError, CancellingError } from "../src/CancellablePromise"
import { delay } from "../src/util"

describe('Cancellable Promises', () => {

  it('can await resolution as normal promise', async () => {
    const p = CancellablePromise.create(resolve => {
      setTimeout(() => resolve('hello!'), 100);
    });

    await expect(p).resolves.toBe('hello!');
  })

  it('can await rejection as normal promise', async () => {
    const p = CancellablePromise.create((_, reject) => {
      setTimeout(() => reject('BAD PROMISE'), 100);
    });

    await expect(p).rejects.toBe('BAD PROMISE');
  })

  it('can be cancelled unlike normal promise', async () => {
    let cancelled = false;
    
    const p = CancellablePromise.create((resolve, _, onCancel) => {
      onCancel(() => {
        cancelled = true;
      })

      setTimeout(() => resolve('blablabla should never get here...'), 200);
    });

    await delay(100);
    await p.cancel();

    await expect(p).rejects.toBeInstanceOf(CancelledError);
    expect(cancelled).toBeTruthy();
  })

  it('can be cancelled, with explicit resolution by onCancel', async () => {
    const p = CancellablePromise.create((resolve, _, onCancel) => {
      onCancel(() => resolve('woof'));
      setTimeout(() => resolve('blablabla should never get here...'), 1000);
    });

    await delay(50);
    await p.cancel();

    await expect(p).rejects.toBeInstanceOf(CancelledError);
  })

  it('can be cancelled, with explicit rejection by onCancel', async () => {
    const p = CancellablePromise.create((resolve, reject, onCancel) => {
      onCancel(() => reject('woof'));
      setTimeout(() => resolve('blablabla should never get here...'), 1000);
    });

    await delay(50);
    await p.cancel();

    await expect(p).rejects.toBeInstanceOf(CancellingError);
  })

  it('flattens nested promises on await', async () => {
    const p = CancellablePromise.create<string>(resolve => {
      setTimeout(() => resolve('hello'), 100);
    });

    const p2 = p.then(s =>
      CancellablePromise.create<string>(resolve => resolve(s + ' Jason!'))
      );

    await expect(p2).resolves.toBe('hello Jason!');
  })

  it('flattens nested promises on upstream map', async () => {
    const p = CancellablePromise.create<string>((resolve) => {
      setTimeout(() => resolve('hello'), 100);
    });

    const p2 = p.then(s =>
      CancellablePromise.create<string>(resolve => resolve(s + ' Jason!'))
      );

    const p3 = p2.then(v => typeof v);

    await expect(p3).resolves.toBe('string');
  })

  it('only completes cancellation when upstream promises complete', async () => {
    let trigger = ()=>{};
    const events: string[] = [];

    const p1 = new Promise<void>(resolve => {
      trigger = () => resolve();
    });

    const p2 = CancellablePromise.create<void>((resolve, reject) => {
      p1.then(resolve).catch(reject);
    });

    p2.cancel().then(() => {
      events.push('cancel complete');
    });

    await delay(50);

    expect(events).not.toContain('cancel complete');

    trigger();

    await delay(50);

    expect(events).toContain('cancel complete');
  })

  it('already completed promise not cancelled', async () => {
    const cancellations: string[] = [];
    
    const p = CancellablePromise.create((resolve, _, onCancel) => {
      const h = setTimeout(() => resolve(123), 30);
      onCancel(() => {
        clearTimeout(h);
        cancellations.push('a');
        resolve(0);
      });
    });

    await delay(100);

    await p.cancel();

    expect(cancellations).toEqual([]);
  })

  it('catches errors into handler', async () => {
    let caught = false;
    
    const p = CancellablePromise.create((_, reject) => {
      setTimeout(() => reject(Error('woof')), 100);
    });

    p.catch(() => caught = true);

    await delay(200);

    expect(caught).toBeTruthy();
  })

  it('catches nested errors into handler', async () => {
    let caught = false;
    
    const p = CancellablePromise.create<true>(resolve => {
      setTimeout(() => resolve(true), 100);
    });

    p.then(() => { throw Error('oink') }).catch(() => caught = true);

    await delay(200);

    expect(caught).toBeTruthy();
  })

  it('errors from hooks go to canceller', async () => {
    const p = CancellablePromise.create((resolve, _, onCancel) => {
      setTimeout(() => resolve(123), 100);
      onCancel(() => { throw 'woof!' });
    });

    const cancelling = p.cancel();

    expect(cancelling).rejects.toBe('woof!');
    expect(p).rejects.toBeInstanceOf(CancelledError);
  })

  it('cancellations flow through combinations', async () => {
    const runs: string[] = [];
    const cancellations: string[] = [];

    const p = CancellablePromise.all([
      CancellablePromise.create<string>((resolve, _, onCancel) => {
        runs.push('a');
        const h = setTimeout(() => { console.log('NEVER'); resolve('NEVER!') }, 1000);
        onCancel(async () => {
          cancellations.push('a');
          clearTimeout(h);
          resolve('');
        });
      }),

      CancellablePromise.create<string>((resolve, _, onCancel) => {
        runs.push('b');
        const h = setTimeout(() => { console.log('NEVER'); resolve('NEVER!') }, 600);
        onCancel(async () => {
          cancellations.push('b');
          clearTimeout(h);
          resolve('');
        });
      })
    ]);

    await delay(100);
    await p.cancel();

    await expect(p).rejects.toBeInstanceOf(CancelledError);

    expect(runs).toContain('a');
    expect(runs).toContain('b');
    
    expect(cancellations).toContain('a');
    expect(cancellations).toContain('b');
  })

  it('cancellations flow through mappings', async () => {
    const runs: string[] = [];
    const cancellations: string[] = [];
    
    const p = CancellablePromise.create((resolve, _, onCancel) => {
      runs.push('a');
      onCancel(() => { cancellations.push('a') });
      
      setTimeout(() => resolve(
        CancellablePromise.create(
          (resolve, reject, onCancel2) => {
            runs.push('b');
            const tid = setTimeout(() => resolve('blablabla should never get here...'), 2000);
            onCancel2(() => {
              cancellations.push('b')
              clearTimeout(tid);
              reject(new CancelledError())
            });
          })),
        50);
    });

    const p2 = p.then(x => CancellablePromise.create((resolve, _, onCancel) => {
      console.info('WOT?!', x)
      runs.push('c');
      onCancel(() => { cancellations.push('c') });
      setTimeout(() => resolve('blablabla should never get here...'), 2000);
    }));

    await delay(100);
    await p2.cancel();

    await expect(p2).rejects.toBeInstanceOf(CancelledError);

    expect(runs).toContain('a');
    expect(runs).toContain('b');
    expect(runs).not.toContain('c');
    
    expect(cancellations).not.toContain('a'); //can't cancel a completed upstream
    expect(cancellations).toContain('b');
  })

  it('cancellations flow through mappings 2', async () => {
    const runs: string[] = [];
    const cancellations: string[] = [];
    
    const p1 = CancellablePromise.create((resolve, _, onCancel) => {
      runs.push('a');
      const h = setTimeout(() => resolve(123), 50);
      onCancel(() => {
        clearTimeout(h);
        cancellations.push('a');
        resolve(0);
      });
    });

    const p2 = p1.then(() => CancellablePromise.create((resolve, _, onCancel) => {
      runs.push('b');
      const h = setTimeout(() => resolve('blablabla should never get here...'), 200);
      onCancel(() => {
        clearTimeout(h);
        cancellations.push('b');
        resolve(0);
      });
    }));

    await delay(100);
    await p2.cancel();

    await expect(p2).rejects.toBeInstanceOf(CancelledError);

    expect(runs).toContain('a');
    expect(runs).toContain('b');
    expect(cancellations).not.toContain('a');
    expect(cancellations).toContain('b');
  })

  it('cancellations flow to catch replacement', async () => {
    const runs: string[] = [];
    const cancellations: string[] = [];
    
    const p1 = CancellablePromise.create((_, reject, onCancel) => {
      runs.push('a');
      setTimeout(() => reject(Error('moo')), 50);
      onCancel(() => { cancellations.push('a') });
    });

    const p2 = p1.catch(() => CancellablePromise.create((resolve, _, onCancel) => {
      runs.push('b');
      const h = setTimeout(() => resolve('blablabla should never get here...'), 200);
      onCancel(() => {
        clearTimeout(h);
        cancellations.push('b');
        resolve(0);
      });
    }));

    await delay(100);
    await p2.cancel();

    await expect(p2).rejects.toBeInstanceOf(CancelledError);

    expect(runs).toContain('a');
    expect(runs).toContain('b');
    expect(cancellations).not.toContain('a');
    expect(cancellations).toContain('b');
  })

})

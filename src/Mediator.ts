import { Exchange, Lock } from './Locks'
import { Set } from 'immutable'
import { Observable } from 'rxjs';
import { Signal } from './MachineSpace';
import { filter, tap, share, shareReplay } from 'rxjs/operators';
import CancellablePromise from './CancellablePromise';
const log = console.log;

export interface Peer {
  chat(m: any): false|[any]
}

export interface Convener<R = any> {
  convene(peers: Set<Peer>): R
}

export interface Attendee<R = any> {
  chat(m: any, peers: Set<Peer>): [R]|[R, any]
}

export class Mediator {
  private kill$ : Observable<any>;
  private locks = new Exchange<Peer>();

  constructor(signal$: Observable<Signal>) {
    this.kill$ = signal$.pipe(filter(s => s.stop), shareReplay(1));
  }

  async convene<R>(convener: Convener<R>, others: Set<object>): Promise<R> {
    const claim = await this.locks
      .claim(...others)
      .cancelOn(this.kill$);

    try {
      const peers = claim.offers(); //peer interface needs to be wrapped here, to remove special messages
      const answer = convener.convene(peers);

      //only live peers should be bothered here - maybe its up to the peers themselves; they will return head when done
      peers.forEach(p => {
        const a = p.chat(false); //should be better, more inscrutable value here
        if(a) throw Error('peer responded badly to kill');
      });

      return answer;
    }
    finally {
      await claim.release();
    }
  }

  async attach<R>(item: object, attend: Attendee<R>): Promise<false|[R]> { //instead of returning false, should relock, retry till we get result
    let _state: false|[R] = false;

    const handle = await CancellablePromise.create<Lock>(
      (resolve, reject) => {
        let _go = true;
        const _handle = this.locks.offer([item],
          {
            chat(m: false|[any]) {
              try {
                if(!_go) return false;
                if(!m) {
                  resolve(_handle);
                  return _go = false;
                }

                const [state, reply] = attend.chat(m, Set());
                _state = [state];

                if(reply === undefined) {
                  resolve(_handle);
                  return _go = false;
                }
                else {
                  return [reply];
                }
              }
              catch(err) {
                reject(err);
                return _go = false;
              }
            }
          });
        })
        .cancelOn(this.kill$);
  
    await handle.release();

    return _state;
  }
}

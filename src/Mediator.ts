import { Exchange, Lock } from './Locks'
import { Set } from 'immutable'
import { Observable } from 'rxjs';
import { Signal } from './MachineSpace';
import { filter, shareReplay } from 'rxjs/operators';
import CancellablePromise from './CancellablePromise';
import { Preemptable } from './Preemptable';
import { Id } from './lib';
import { inspect } from 'util';

const log = console.debug;
const logFlow = (id0:Id, m:unknown, id1:Id) => {}; // log(id0, '->', inspect(m, {colors:true}), '->', id1);

export interface MPeer {
  id: Id
  chat(m: [Id,unknown]|false): false|[any]
}

export interface ConvenedPeer {
  id: Id
  chat(m: [unknown]|false): false|[any]
}

export interface AttendingPeer {
  id: Id
  chat(m: [unknown]|false): false|[any]
}

export interface MConvener<R = any> {
  id: Id
  receive(peers: Set<ConvenedPeer>): R
}

export interface MAttendee<R = any> {
  id: Id
  receive(m: [Id,unknown], peers: Set<AttendingPeer>): [R]|[R, any]
}

export class Mediator {
  private kill$ : Observable<any>;
  private locks = new Exchange<MPeer>();

  constructor(signal$: Observable<Signal>) {
    this.kill$ = signal$.pipe(filter(s => s.stop), shareReplay(1));
  }

  //below is well-intentioned, but half-baked
  //todo: map should be able to do async
  convene2<R>(convener: MConvener<R>, others: Set<object>): Preemptable<R> {
    return this.locks
      .claim(...others)
      .map(claim => {
        try {
          const peers = claim.offers(); //peer interface needs to be wrapped here, to remove special messages

          const answer = convener.receive(
            peers.map<ConvenedPeer>(p => ({
              id: p.id,
              chat(m: [unknown]|false) {
                logFlow(convener.id, m, p.id);
                if(m) return p.chat([convener.id, ...m])
                else return p.chat(false);
              }
            }))
          );

          //only live peers should be bothered here - maybe its up to the peers themselves; they will return head when done
          peers.forEach(p => {
            logFlow('.', false, p.id);
            const a = p.chat(false);
            if(a) throw Error('peer responded badly to kill');
          });

          return answer;
        }
        finally {
          claim.release(); //NOTE async!!!!
          // await claim.release();
        }
      });
      // .cancelOn(this.kill$);
  }

  async convene<R>(convener: MConvener<R>, others: Set<object>): Promise<R> {
    const claim = await this.locks
      .claim(...others)
      .promise()
      .cancelOn(this.kill$);

    try {
      const peers = claim.offers(); //peer interface needs to be wrapped here, to remove special messages

      const answer = convener.receive(
        peers.map<ConvenedPeer>(p => ({
          id: p.id,
          chat(m: [unknown]|false) {
            logFlow(convener.id, m, p.id);
            if(m) return p.chat([convener.id, ...m])
            else return p.chat(false);
          }
        }))
      );

      //only live peers should be bothered here - maybe its up to the peers themselves; they will return head when done
      peers.forEach(p => {
        logFlow('.', false, p.id);
        const a = p.chat(false);
        if(a) throw Error('peer responded badly to kill');
      });

      return answer;
    }
    finally {
      await claim.release();
    }
  }

  async attend<R>(item: object, attend: MAttendee<R>): Promise<false|[R]> { //instead of returning false, should relock, retry till we get result
    let _state: false|[R] = false;

    const handle = await CancellablePromise.create<Lock>(
      (resolve, reject) => {
        let _go = true;
        const _handle = this.locks.offer([item],
        <MPeer>{
          id: attend.id,

          chat(m: [Id,unknown]|false) {
            try {
              if(!_go) return false;
              if(!m) {
                resolve(_handle);
                return _go = false;
              }

              const [state, reply] = attend.receive(m, Set()); //todo Set here needs proxying to include attend.id
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
        }).promise();
      })
      .cancelOn(this.kill$);
  
    await handle.release();

    return _state;
  }
}

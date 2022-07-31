import { Exchange, Lock } from './Locks'
import { Set } from 'immutable'
import { Observable } from 'rxjs';
import { Signal } from './MachineSpace';
import { filter, shareReplay } from 'rxjs/operators';
import CancellablePromise from './CancellablePromise';
import { Preemptable } from './Preemptable';
import { Id } from './lib';
import { inspect } from 'util';

const log = console.log;
const logFlow = (id0:Id, m:unknown, id1:Id) => log('CHAT', id0, '->', id1, inspect(m, {depth:1, colors:true}));

export interface MPeer {
  id: Id
  chat(m: [Id,unknown]|false): false|[unknown]
}

export interface ConvenedPeer {
  id: Id
  chat(m: [unknown]|false): false|[unknown]
}

export interface AttendingPeer {
  id: Id
  chat(m: [unknown]|false): false|[unknown]
}

export interface MConvener<R = unknown> {
  id: Id
  convened(peers: Set<ConvenedPeer>): R
}

export interface MAttendee<R = unknown> {
  id: Id
  attended(m: [Id,unknown], peers: Set<AttendingPeer>): [R]|[R, unknown]
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

          const answer = convener.convened(
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
            logFlow('!!', false, p.id);
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

      const answer = convener.convened(
        peers.map<ConvenedPeer>(p => ({
          id: p.id,
          chat(m: [unknown]|false) {
            logFlow(convener.id+'!', m, p.id);
            if(m) {
              const r = p.chat([convener.id, ...m])
              logFlow(p.id, r, convener.id+'!');
              return r;
            }
            else { 
              return p.chat(false);
            }
          }
        }))
      );

      //only live peers should be bothered here - maybe its up to the peers themselves; they will return head when done
      peers.forEach(p => {
        logFlow('!!', false, p.id);
        const a = p.chat(false);
        if(a) throw Error('peer responded badly to kill');
      });

      console.debug('convene end');

      return answer;
    }
    finally {
      await claim.release();
    }
  }

  async attend<R>(item: object, attend: MAttendee<R>): Promise<false|[R]> { //instead of returning false, should relock, retry till we get result
    let _state = <[R]|false>false;

    const handle = await CancellablePromise.create<Lock>(
      (resolve, reject) => {
        let _go = true;
        const _handle = this.locks.offer([item],
        <MPeer>{
          id: attend.id,

          //if _go is false, 
          //this must be because our conveners are joining the same attendance
          //or rather... spot is the attendee here
          //and the two attempts to convene spot
          //are being passed to the same handler

          //but is this right?
          //if the mechanism says false here, then the convener should retry?
          //false is a blunt device - how can the convener know it just needs to retry?
          //also retrying is wasteful if another convener is already queued

          //but: given spot has just successfully attended,
          //it has to have a break, at least to yield its next phase to the mechanism
          //and in this break it would work,
          //as the locking mechanism forms a queue of claimants
          //and the convener would be waiting for the attendee to appear

          //the problem then is that the same attendee is being found:
          //the attendee disables itself before it is removed from the lock
          //it should disable itself exactly as it is removed
          //so - a hook on the lock release
          //as soon as the lock is released, in the same movement, we disable the handler
          //but if the handler is unreachable from that moment, we have no need to self-disable
          //the _go flag is _BAD_ then, and should be removed in favour on relying on an atomic removal from the lock

          chat(m: [Id,unknown]|false) {

            if(m) console.log('A', m[0], '>>>>', inspect( m[1], {depth:1}));
            
            try {
              if(!_go) {
                console.log('A _go=false', attend.id);
                return false;
              }
              if(!m) {
                resolve(_handle);
                console.log('A !m');
                return _go = false;
              }

              const [state, reply] = attend.attended(m, Set()); //todo Set here needs proxying to include attend.id
              _state = [state];

              if(reply === undefined) {
                resolve(_handle);
                console.log('A reply === undefined');
                return _go = false;
              }
              else {
                return [reply];
              }
            }
            catch(err) {
              reject(err);
              console.log('A err');
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

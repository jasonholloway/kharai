import { Exchange } from './Locks'
import { Set } from 'immutable'
import { Observable } from 'rxjs';
import { Signal } from './MachineSpace';
import { filter, shareReplay } from 'rxjs/operators';
import CancellablePromise from './CancellablePromise';
import { Preemptable } from './Preemptable';
import { Id } from './lib';
import { inspect } from 'util';

const log = console.log;
const logFlow = (id0:Id, m:unknown, id1:Id) => log('CHAT', id0, '->', id1, inspect(m, {depth:2, colors:true}));

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
  //and cancellation should be appliable to preemptable
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
                logFlow(convener.id+'!', m, p.id);
                if(m) return p.chat([convener.id, ...m])
                else return p.chat(false);
              }
            }))
          );

          //only live peers should be bothered here - maybe its up to the peers themselves; they will return head when done
          peers.forEach(p => {
            // logFlow('!!', false, p.id);
            const a = p.chat(false);
            if(a) throw Error('peer responded badly to kill');
          });

          return answer;
        }
        finally {
          claim.release(); //NOTE async!!!!
          // await claim.release();
        }
      })
      // .cancelOn(this.kill$);
  }

  async convene<R>(convener: MConvener<R>, others: Set<object>): Promise<R> {
    const claim = await this.locks
      .claim(...others)
      .promise()
      .cancelOn(this.kill$);

    // console.debug('CONVENE LOCKED');

    const peers = claim.offers(); //peer interface needs to be wrapped here, to remove special messages

    try {
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
        // logFlow('!!', false, p.id);
        const a = p.chat(false);
        if(a) throw Error('peer responded badly to kill');
      });

      return answer;
    }
    finally {
      claim.release();
      // console.debug('CONVENE RELEASED');
    }
  }

  async attend<R>(item: object, attend: MAttendee<R>): Promise<false|[R]> { //instead of returning false, should relock, retry till we get result
    return await CancellablePromise.create<[R]|false>(
      (resolve, reject) => {
        let _active = true;
        let _state = <[R]|false>false;
        
        this.locks.offer([item],
          handle => (
          {
            id: attend.id,

            chat(m: [Id,unknown]|false) {
              // log('ATTEND CHAT BEGIN')

              try {
                if(!m) return fin(); //been told to clear off; state still returned
                if(!_active) throw Error('DEAD ATTENDEE SENT MESSAGE!'); //a dead machine can't receive non-false messages

                const [s, reply] = attend.attended(m, Set()); //todo Set here needs proxying to include attend.id
                _state = [s];

                // logFlow(attend.id, reply, m[0]+'!');

                if(reply === undefined) {
                  //attendee talks no more
                  return fin();
                }
                else {
                  //attendee replies
                  // logFlow(attend.id, reply, m[0]+'!');
                  return [reply];
                }
              }
              catch(err) {
                return fin(err);
              }
              finally {
                // log('ATTEND CHAT END')
              }


              function fin(err?: unknown): false {
                if(_active) {
                  _active = false;
                  handle.release();

                  if(err) reject(err);
                  else resolve(_state);

                  // log('ATTEND ENDED')
                }

                return false;
              }
            }
          })
        ).promise();
      })
      .cancelOn(this.kill$);
  }

}

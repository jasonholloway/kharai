import { Exchange, Lock } from './Locks'
import { Set } from 'immutable'
import { Observable, Subject } from 'rxjs';
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
  complete: Promise<void>
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

    console.debug('CONVENE LOCKED');

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
        logFlow('!!', false, p.id);
        const a = p.chat(false);
        if(a) throw Error('peer responded badly to kill');
      });

      return answer;
    }
    finally {
      console.debug('CONVENE ENDING');
      await Promise.all(peers.map(p => p.complete));
      await claim.release();
      console.debug('CONVENE RELEASED');
    }
  }

  async attend<R>(item: object, attend: MAttendee<R>): Promise<false|[R]> { //instead of returning false, should relock, retry till we get result
    return await CancellablePromise.create<[R]|false>(
      (resolve, reject) => {
        let _go = true;
        let _state = <[R]|false>false;
        const _complete$ = new Subject();
        
        const _handle = this.locks.offer([item],
        <MPeer>{
          id: attend.id,

          complete: _complete$.toPromise(),

          // the problem is that the handle itself
          // doesn't return until the claimant releases, which is too late
          // it makes sense that the release should wait for the claimant
          // but not the handle itself!

          chat(m: [Id,unknown]|false) {
            log('ATTEND CHAT BEGIN')

            const end = (err?: unknown) => {
              log('ATTEND ENDING')
              if(_go) {
                _go = false;

                log('ATTEND GETTING HANDLE')
                _handle.then(h => {
                  h.release();
                  log('ATTEND RELEASING HANDLE')

                  if(err) reject(err);
                  else resolve(_state);

                  _complete$.complete();
                  log('ATTEND ENDED')
                });
              }
              else {
                log('ATTEND _go is false! This is wrong. The attendee must be being used multiple times... FIX THIS!')
              }

              return false;
            };
            
            try {
              if(!_go) {
                log('ATTEND INACTIVE', attend.id);
                return end();
              }
              if(!m) {
                //convener closes us down - but state should still be returned
                return end();
              }

              const [s, reply] = attend.attended(m, Set()); //todo Set here needs proxying to include attend.id
              _state = [s];

              //!!!!!!!!!!!!!!!!!!!!!!
              //state does need stowing in a field mate...
              //!!!!!!!!!!!!!!!!!!!!!!

              logFlow(attend.id, reply, m[0]+'!');

              if(reply === undefined) {
                //attendee talks no more
                return end();
              }
              else {
                //attendee replies
                return [reply];
              }
            }
            catch(err) {
              return end(err);
            }
            finally {
              log('ATTEND CHAT END')
            }
          }
        }).promise();
      })
      .cancelOn(this.kill$);
  }

}

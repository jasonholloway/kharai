import { Exchange } from './Locks'
import { Set } from 'immutable'
import { Observable } from 'rxjs';
import { Signal } from './MachineSpace';
import { filter, shareReplay } from 'rxjs/operators';
import CancellablePromise from './CancellablePromise';
import { Preemptable } from './Preemptable';
import { inspect, isString } from 'util';

const log = console.log;

const logFlow = (id0:{info?:unknown}, m:unknown, id1:{info?:unknown}, fromConvener:boolean) =>
  log('CHAT',
      `${stringify(id0)}${fromConvener ? '!' : ''}`,
      '->',
      `${stringify(id1)}${fromConvener ? '' : '!'}`,
      inspect(m, {depth:1, colors:true})
     );

const stringify = (o: {info?:unknown}) => {
  const found = (<{ id:string }|undefined>o.info)?.id;
  return isString(found) ? found : '';
}


export interface MConvener<R = unknown> {
  info?: PeerInfo,
  convened(peers: Set<MPeer>): R
}

export interface MAttendee<R = unknown> {
  info?: PeerInfo,
  attended(m: unknown, info: PeerInfo, peers: Set<MPeer>): [R]|[R, unknown]|false
}

export interface MPeer {
  info?: PeerInfo,
  chat(m: Msg): [unknown]|false
}


export type Msg = unknown;
export type PeerInfo = unknown;


type _Peer = {
  chat(m: [Msg,PeerInfo]|false): [unknown]|false,
  info?: PeerInfo
}



export class Mediator {
  private kill$ : Observable<any>;
  private locks = new Exchange<_Peer>();

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
          const peers = claim.offers();

          const answer = convener.convened(
            peers.map(p => <MPeer>{
              chat(m: Msg) {
                return p.chat([m, convener.info]);
              }
            }));

          peers.forEach(p => {
            const a = p.chat(false);
            if(a) throw Error('peer responded badly to kill');
          });

          return answer;
        }
        finally {
          claim.release(); //NOTE async!!!!
        }
      })
      // .cancelOn(this.kill$);
  }

  async convene<R>(convener: MConvener<R>, others: Set<object>): Promise<R> {
    const claim = await this.locks
      .claim(...others)
      .promise()
      .cancelOn(this.kill$);

    try {
      const peers = claim.offers();

      const answer = convener.convened(
        peers.map(p => <MPeer>{
          info: p.info,
          chat(m: Msg) {
            logFlow(convener, m, p, true);
            return p.chat([m, convener.info]);
          }
        }));

      peers.forEach(p => {
        const a = p.chat(false);
        if(a) throw Error('peer responded badly to kill');
      });

      return answer;
    }
    finally {
      claim.release();
    }
  }

  async attend<R>(item: object, attend: MAttendee<R>): Promise<false|[R]> { //instead of returning false, should relock, retry till we get result
    return await CancellablePromise.create<[R]|false>(
      (resolve, reject) => {
        let _active = true;
        let _state = <[R]|false>false;
        
        this.locks.offer([item],
          lock => <_Peer>{

            info: attend.info,

            //handle incoming message from convener/peer
            //we should know where message is coming from also - 
            chat(m: [Msg,PeerInfo]|false) {
              try {
                if(!m) return fin(); //been told to clear off; state still returned
                if(!_active) throw Error('DEAD ATTENDEE SENT MESSAGE!');

                //TODO below can also return false!!!!
                const r = attend.attended(...m, Set()); //todo: fill in peers here
                if(!r) return fin();
                
                const [s, reply] = r;
                _state = [s];

                if(reply === undefined) {
                  //attendee talks no more
                  return fin();
                }
                else {
                  //attendee replies
                  logFlow(attend, reply, {info:m[1]}, false);
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
                  lock.release();

                  if(err) reject(err);
                  else resolve(_state);

                  // log('ATTEND ENDED')
                }

                return false;
              }
            }
          }
        ).promise();
      })
      .cancelOn(this.kill$)
  }

}

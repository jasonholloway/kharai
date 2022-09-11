import { MAttendee, MConvener, Mediator, MPeer } from './Mediator'
import { Observable } from 'rxjs'
import { Set } from 'immutable'
import { Timer } from './Timer'
import { Signal } from './MachineSpace'

const log = console.debug;
// const logChat = (id0:Id[], id1:Id, m:unknown) => log('CHAT', ...id0, '->', id1, inspect(m, {colors:true}));

export class RunSpace {
  private readonly mediator: Mediator
  private readonly timer: Timer

  constructor(
    timer: Timer,
    signal$: Observable<Signal>
  ) {
    this.mediator = new Mediator(signal$);
    this.timer = timer;
  }

  newRun(): Run {
    return new Run(this.mediator, this.timer);
  }  
}


export type RunCtx = {
  side: { get():unknown, set(d:unknown):void } 
  timer: Timer
  attend: <R>(attend: MAttendee<R>) => Promise<false|[R]>
  convene: <R>(others: ArrayLike<Run>, convene: MConvener<R>) => Promise<R>
}


export type RunHandler<R> = (ctx: RunCtx) => Promise<R>;


export class Run {
  private readonly mediator: Mediator;
  private readonly timer: Timer;
  private sideData = <unknown>undefined;

  constructor(mediator: Mediator, timer: Timer) {
    this.mediator = mediator;
    this.timer = timer;
  }
  
  async run<R>(fn: RunHandler<R>): Promise<R> {
    return await fn(this.createContext());
  }

  private createContext(): RunCtx {
    const _this = this;

    return {
      side: {
        get() {
          return _this.sideData;
        },
        set(d:unknown) {
          _this.sideData = d;
        }
      },

      timer: _this.timer,

      attend<R>(attendee: MAttendee<R>): Promise<false|[R]> {
        return _this.mediator.attend<R>(_this, {
          id: _this.id,
          attended(m: [RunId,unknown], peers: Set<MPeer>): [R]|[R, unknown]|false {
            throw 123;
          }
        });
      },

      
      async convene<R>(ids: RunId[], convener: Convener<R>) {
        return await _this.mediator
          .convene({
            id: _this.id,
            convened(peers) {
              //here the convener is given some peers to chat to

              const proxied = peers.map(p => <Peer>({
                id: p.id,
                chat(m) {
                  // logChat(['C:'+id], 'A:'+p.id, m);
                  return p.chat([[$Ahoy, commit, m]]);
                }
              }));

              const result = convened(proxied);

              // logChat([...peers.map(p => p.id)], result, id);

              return result;
            }
          }, Set(ms));
      }



    };
  }
};




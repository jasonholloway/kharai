import { MAttendee, MConvener, Mediator, MPeer } from './Mediator'
import { Observable } from 'rxjs'
import { Set } from 'immutable'
import { Timer } from './Timer'
import { Signal } from './MachineSpace'

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
  
  //below should take commit as arg
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
          info: attendee.info,
          attended(m: unknown, info: unknown, peers: Set<MPeer>): [R]|[R, unknown]|false {
            return attendee.attended(m, info, peers);
          }
        });
      },
      
      convene<R>(others: ArrayLike<Run>, convener: MConvener<R>) {
        return _this.mediator
          .convene({
            info: convener.info,
            convened(peers) {
              return convener.convened(
                peers.map(p => <MPeer>({
                  info: p.info,
                  chat(m) {
                    return p.chat(m);
                  }
                })));
            }
          }, Set(others));
      }

    };
  }
};




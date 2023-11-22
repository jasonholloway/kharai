import { MAttendee, MConvener, Mediator, MPeer } from './Mediator'
import { Observable, Observer, ReplaySubject, Subject } from 'rxjs'
import { tap, map } from 'rxjs/operators'
import { Set, OrderedSet } from 'immutable'
import { Timer } from './Timer'
import { Signal } from './MachineSpace'
import { Lump } from './AtomSpace'
import Commit from './Committer'
import _Monoid from './_Monoid'
import { AtomRef } from './atoms'
import { inspect } from 'node:util'
import { Attempt } from './Attempt'

const $Yo = Symbol('$Yo');

export class RunSpace<V, L=V> {
  private readonly mv: _Monoid<V>
  private readonly mediator: Mediator
  private readonly timer: Timer
  private readonly sink: Observer<Lump<V>>

  constructor(
    mv: _Monoid<V>,
    timer: Timer,
    signal$: Observable<Signal>,
    sink: Observer<Lump<V>>
  ) {
    this.mv = mv;
    this.mediator = new Mediator(signal$);
    this.timer = timer;
    this.sink = sink;
  }

  newRun(): Run<V,L> {
    return new Run(this.mv, this.mediator, this.timer, this.sink);
  }  
}


export type RunCtx<V,L> = {
  side: { get():unknown, set(d:unknown):void } 
  timer: Timer
  attend: <R>(attend: MAttendee<R>) => Attempt<R>
  convene: <R>(others: ArrayLike<Run<V,L>>, convene: MConvener<R>) => Promise<R>
  track: (target: Run<V,L>) => Observable<L>
}


export type RunHandler<V,L,R> = (ctx: RunCtx<V,L>) => Promise<[[V,number]|false,L,R]|false>;

export class Run<V,L=V> {
  private readonly mv: _Monoid<V>;
  private readonly mediator: Mediator;
  private readonly timer: Timer;
  private readonly sink: Observer<Lump<V>>
  private running: Promise<[AtomRef<V>, unknown]|false>;
  private log$: Subject<[AtomRef<V>,L]>;
  private sideData = <unknown>undefined;

  constructor(mv: _Monoid<V>, mediator: Mediator, timer: Timer, sink: Observer<Lump<V>>) {
    this.mv = mv;
    this.mediator = mediator;
    this.timer = timer;
    this.sink = sink;
    this.running = Promise.resolve([new AtomRef<V>(),undefined]);
    this.log$ = new ReplaySubject(1);
  }
  
  async run<R>(fn: RunHandler<V,L,R>): Promise<[AtomRef<V>,R]|false> {   
    this.running = this.running
      .then<[AtomRef<V>,unknown]|false>(async s => {
        if(!s) return false;

        const [a1] = s;

        const commit = new Commit<V>(this.mv, this.sink, OrderedSet([a1]));

        try {
          const result = await fn(this.context(commit));

          if(result) {
            const [c, l, r] = result;

            if(c) {
              const [v, w] = c;
              const a2 = await commit.complete(v, w);
              this.log$.next([a2, l]);
              return [a2, r];
            }
            else {
              this.log$.next([a1, l]);
              return [a1, r];
            }
          }
          else {
            return false;
          }
        }
        catch(e) {
          commit.abort();
          throw e;
        }
      });

    return <[AtomRef<V>,R]|false>await this.running;
  }

  complete() {
    this.log$.complete();
  }

  private context(commit: Commit<V>): RunCtx<V,L> {
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

      attend<R>(attendee: MAttendee<R>): Attempt<R> {
        return _this.mediator
          .attend<R>(_this, {
            info: attendee.info,

            attended(m: unknown, info: unknown, peers: Set<MPeer>): [R]|[R, unknown]|false {
              if(isYo(m)) {
                const peerCommit = m[1];
                Commit.conjoin(_this.mv, [commit, peerCommit]);
                m = m[2];
              }

              const result = attendee.attended(m, info, peers.map(p => <MPeer>({
                info: p.info,
                chat(m) {
                  return p.chat([$Yo, commit, m]);
                }
              })));

              return result;
            }
          });

        function isYo(v: unknown): v is [typeof $Yo, Commit<V>, unknown] {
          return Array.isArray(v) && v.length == 3 && v[0] === $Yo;
        }
      },
      
      convene<R>(others: ArrayLike<Run<V,L>>, convener: MConvener<R>) {
        return _this.mediator
          .convene({
            info: convener.info,

            convened(peers) {
              return convener.convened(
                peers.map(p => <MPeer>({
                  info: p.info,
                  chat(m) {
                    return p.chat([$Yo, commit, m]);
                  }
                })));
            }

          }, Set(others));
      },
      
      track(target: Run<V,L>): Observable<L> {
        return target.log$
          .pipe(
            // tap(l=> console.debug('L', inspect(l, {depth:2}))),
            map(([a,l]) => {
              commit.addUpstreams(OrderedSet([a]));
              return l;
            })
          );
      }
    };
  }
};

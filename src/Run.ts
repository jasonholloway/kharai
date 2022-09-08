import { Id, DataMap } from './lib'
import { Mediator, ConvenedPeer } from './Mediator'
import { Observable, ReplaySubject, of, concat, Subject, merge } from 'rxjs'
import { startWith, endWith, scan, takeWhile, finalize, map, tap, toArray, ignoreElements, concatMap, filter, takeUntil, shareReplay, mergeMap } from 'rxjs/operators'
import { Set } from 'immutable'
import { Convener, MachineSpace, Peer, Signal } from './MachineSpace'
import { runSaver } from './AtomSpace'
import MonoidData from './MonoidData'
import { Saver, Loader } from './Store'
import { Preemptable } from './Preemptable'
import { BuiltWorld } from './shape/BuiltWorld'
import { Data } from './shape/common'
import { RealTimer } from './Timer'

const MD = new MonoidData();
const gather = <V>(v$: Observable<V>) => v$.pipe(toArray()).toPromise();

export type RunOpts = {
  threshold?: number,
  save?: boolean
};

export function newRun<N>
(
  world: BuiltWorld<N>,
  loader: Loader,
  saver: Saver<DataMap>,
  opts?: RunOpts
) {
  const signal$ = new ReplaySubject<Signal>(1);
  const kill$ = signal$.pipe(filter(s => s.stop), shareReplay(1));
  const complete = () => signal$.next({ stop: true });

  const timer = new RealTimer(kill$);
  const mediator = new Mediator(signal$);
  const space = new MachineSpace(world, loader, mediator, timer, signal$)

  const threshold$ = concat(
    of(opts?.threshold ?? 3),
    kill$.pipe(map(_ => 0))
  ).pipe(shareReplay(1));

  const save = opts?.save ?? true;

  space.commit$.pipe(
    runSaver(signal$, threshold$, MD),
    concatMap(fn => save ? fn(saver) : []),
    takeUntil(kill$)
  ).subscribe();

  const machine$ = space.machine$;
  const log$ = machine$.pipe(
    mergeMap(m => m.log$.pipe(
      map(l => [m.id, l] as const)
    )));

  const keepAlive$ = new Subject<number>();

  const count$ = merge(
    machine$.pipe(
      mergeMap(m => m.log$.pipe(
        ignoreElements(),
        startWith<number>(1),
        endWith<number>(-1),
      ))),
    keepAlive$
  ).pipe(
    scan((c, n) => c + n, 0)
  );

  //todo: on any error, cancel eveything cleanly and stop

  count$.pipe(
    takeWhile(c => c > 0),
    finalize(() => complete()),
  ).subscribe();

  return {
    machine$,
    log$,
    complete,

    async summon(ids: Id[]) {
      const machines = Set(await gather(
        space.summon(Set(ids))
      ));

      return {
        meet<R = unknown>(convener: Convener<R>): Preemptable<R> {
          return mediator.convene2({
            id: '',
            convened(peers: Set<ConvenedPeer>) {
              return convener.convened(peers.map<Peer>(p => ({
                id: p.id,
                chat(m: [unknown]|false): false|[any] {
                  return p.chat(m);
                }
              })));
            }
          }, machines)
        },

        tell(m: unknown) {
          return this.meet({
            convened([p]) {
              return p.chat([m])
            }
          });
        },

        boot(p: Data<N>) {
          return this.tell(p);
        },

        log$: of(...machines).pipe(
          mergeMap(m => m.log$))
      }
    },

    async boot(id: Id, p: Data<N>): Promise<boolean> {
      const ms = await this.summon([id]);
      const [done] = ms.tell(p).preempt();
      return done;
    },

    keepAlive(): (()=>void) {
      keepAlive$.next(1);
      return () => {
        keepAlive$.next(-1);
      };
    }
  };
}



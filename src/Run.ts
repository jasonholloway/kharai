import { Id, DataMap } from './lib'
import { Observable, ReplaySubject, of, concat, Subject, merge } from 'rxjs'
import { startWith, endWith, scan, takeWhile, finalize, map, toArray, ignoreElements, concatMap, filter, takeUntil, shareReplay, mergeMap } from 'rxjs/operators'
import { Set } from 'immutable'
import { ConvenedFn, Convener, MachineSpace, Signal } from './MachineSpace'
import { runSaver } from './AtomSpace'
import MonoidData from './MonoidData'
import { Saver, Loader } from './Store'
import { BuiltWorld } from './shape/BuiltWorld'
import { Data } from './shape/common'
import { RealTimer } from './Timer'
import { RunSpace } from './RunSpace'

const MD = new MonoidData();
const gather = <V>(v$: Observable<V>) => v$.pipe(toArray()).toPromise();

export type RunOpts = {
  threshold?: number,
  save?: boolean
};

const dummySaver: Saver<DataMap> = {
  prepare() {
    return {
      save: () => Promise.resolve()
    }
  }
};

export function newRun<N>
(
  world: BuiltWorld<N>,
  loader: Loader,
  saver: Saver<DataMap>,
  opts?: RunOpts
) {
  if(opts?.save === false) saver = dummySaver;

  const signal$ = new ReplaySubject<Signal>(1);
  const kill$ = signal$.pipe(filter(s => s.stop), shareReplay(1));
  const complete = () => signal$.next({ stop: true });

  const space = new MachineSpace(world, loader, new RunSpace(new RealTimer(kill$), signal$), signal$)
  const { machine$, commit$ } = space;

  const log$ = machine$.pipe(
    mergeMap(m => m.log$.pipe(
      map(l => [m.id, l] as const)
    )));

  const threshold$ = concat(
    of(opts?.threshold ?? 3),
    log$.pipe(
      ignoreElements(),
      endWith(0)
    )
  ).pipe(shareReplay(1));

  runSaver(MD, commit$, threshold$)
    .pipe(concatMap(fn => fn(saver)))
    .subscribe();

  const keepAlive$ = new Subject<number>();

  merge(
    machine$.pipe(
      mergeMap(m => m.log$.pipe(
        ignoreElements(),
        startWith<number>(1),
        endWith<number>(-1),
      ))),
    keepAlive$
  ).pipe(
    scan((c, n) => c + n, 0),
    takeWhile(c => c > 0),
    finalize(complete)
  ).subscribe()

  return {
    machine$,
    log$,
    complete,

    async summon(ids: Id[]) {
      const machines = Set(await gather(
        space.summon(Set(ids))
      ));

      return {
        meet<R = unknown>(convener: Convener<R>|ConvenedFn<R>): Promise<R> {
          //below rubbishly resummons
          return space.runArbitrary(x => {
            return x.convene(ids, convener);
          });
        },

        tell(m: unknown) {
          return this.meet(([p]) => p.chat(m));
        },

        log$: of(...machines).pipe(
          mergeMap(m => m.log$))
      }
    },

    async boot(id: Id, p: Data<N>): Promise<boolean> {
      const ms = await this.summon([id]);
      const result = await ms.tell(p);
      return result && !!result[0];
    },

    keepAlive(): (()=>void) {
      keepAlive$.next(1);
      return () => {
        keepAlive$.next(-1);
      };
    }
  };
}



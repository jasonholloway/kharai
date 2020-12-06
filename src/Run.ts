import { Id, PhaseMap, Phase, WorldImpl, Data, ContextImpl, MachineContext } from './lib'
import { Mediator, Convener } from './Mediator'
import { Observable, ReplaySubject, of, concat, Subject, merge } from 'rxjs'
import { flatMap, startWith, endWith, scan, takeWhile, finalize, map, toArray, ignoreElements, concatMap, filter, takeUntil, shareReplay  } from 'rxjs/operators'
import { Set } from 'immutable'
import { MachineSpace, Loader, Signal } from './MachineSpace'
import { buildDispatch } from './dispatch'
import { runSaver } from './AtomSpace'
import MonoidData from './MonoidData'
import Store from './Store'
import { Log } from './runMachine'
import { AtomRef } from './atoms'
import { Preemptable } from './Preemptable'

const log = console.log;
const MD = new MonoidData();
const gather = <V>(v$: Observable<V>) => v$.pipe(toArray()).toPromise();

export function newRun<
	W extends PhaseMap,
	P = Phase<W>,
  X extends MachineContext<P> = MachineContext<P>>
(
	world: WorldImpl<W, X> & ContextImpl<P, X>,
	loader: Loader<P>,
	opts?: { threshold?: number, store?: Store<Data> }
) {
	const signal$ = new ReplaySubject<Signal>(1);
	const kill$ = signal$.pipe(filter(s => s.stop), shareReplay(1));
	const complete = () => signal$.next({ stop: true });
	const store = opts?.store;

	const mediator = new Mediator(signal$);
	const space = new MachineSpace(world, loader, buildDispatch(world.phases), mediator, signal$)

	if(store) {
		const threshold$ = concat(
			of(opts?.threshold ?? 3),
			kill$.pipe(map(_ => 0))
		).pipe(shareReplay(1));

		space.commit$.pipe(
			runSaver(signal$, threshold$, MD),
			concatMap(fn => fn(store)),
			takeUntil(kill$)
		).subscribe();
	}
	else {
		space.commit$.pipe(
			takeUntil(kill$)
		).subscribe();
	}
	

	const machine$ = space.machine$;
	const log$ = machine$.pipe(
		flatMap(m => m.log$.pipe(
			map<Log<P>, [Id, P|false, AtomRef<Data>?]>(
				([p,r]) => r ? [m.id, p, r] : [m.id, p])
		)));

	const keepAlive$ = new Subject<number>();

	const count$ = merge(
		machine$.pipe(
			flatMap(m => m.log$.pipe(
				ignoreElements(),
				startWith<number>(1),
				endWith<number>(-1),
			))),
		keepAlive$
	).pipe(
		scan((c, n) => c + n, 0)
	);

	count$.pipe(
		takeWhile(c => c > 0),
		finalize(() => complete())
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
				meet<R = any>(convener: Convener<R>): Preemptable<R> {
					return mediator.convene2(convener, machines)
				},

				tell(m: any) {
					return this.meet({
						convene([p]) {
							return p.chat([m])
						}
					});
				},

				boot(p: Phase<W>) {
					return this.tell(p);
				},

				log$: of(...machines).pipe(
					flatMap(m => m.log$))
			}
		},

		async boot(id: Id, p: Phase<W>) {
			const ms = await this.summon([id]);
			return await ms.tell(p).promise();
		},

		async tryBoot(id: Id, p: Phase<W>): Promise<boolean> {
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



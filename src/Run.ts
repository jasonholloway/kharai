import { Id, PhaseMap, Phase, WorldImpl, Data, ContextImpl, MachineContext } from './lib'
import { Mediator, Convener } from './Mediator'
import { Observable, ReplaySubject, of, concat } from 'rxjs'
import { flatMap, startWith, endWith, scan, takeWhile, finalize, map, toArray, ignoreElements, concatMap, filter, takeUntil, shareReplay } from 'rxjs/operators'
import { Set } from 'immutable'
import { MachineSpace, Loader, Signal } from './MachineSpace'
import { buildDispatch } from './dispatch'
import { runSaver } from './AtomSpace'
import MonoidData from './MonoidData'
import Store from './Store'
import { Log } from './runMachine'
import { AtomRef } from './atoms'

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

	const count$ = machine$.pipe(
		flatMap(m => m.log$.pipe(
			ignoreElements(),
			startWith<number>(1),
			endWith<number>(-1),
			)),
		scan((c, n) => c + n, 0));

	count$.pipe(
		takeWhile(c => c > 0),
		finalize(() => complete())
	).subscribe();

	return {
		machine$,
		log$,
		complete,

		async meet<R = any>(ids: Id[], convener: Convener<R>): Promise<R> {
			const machines = await gather(
				space.summon(Set(ids))
			);

			return await mediator
				.convene(convener, Set(machines));
		},

		tell(id: Id, m: any) {
			return this.meet([id], {
				convene([p]) {
					return p.chat([m])
				}
			});
		},

		boot(id: Id, p: Phase<W>) {
			return this.tell(id, p);
		}
	};
}




// export class Run<W extends PhaseMap, X, P = Phase<W>> {
//   readonly mediator: Mediator
//   readonly space: MachineSpace<W, X, P>
// 	readonly signal$: Subject<Signal>

// 	readonly machine$: Observable<Machine<P>>
//   readonly log$: Observable<Emit<P>>

//   constructor(world: WorldImpl<W, X> & ContextImpl<X>, loader: Loader<P>, store: Store<Data>) {
// 		this.signal$ = new ReplaySubject<Signal>(1);
//     this.mediator = new Mediator(this.signal$);		
//     this.space = new MachineSpace(world, loader, <Dispatch<X, P>><unknown>buildDispatch(world.phases), this.mediator, this.signal$);

// 		const saveSub = this.space.commit$.pipe(
// 			prepareSaves(this.signal$, MD),
// 			concatMap(fn => fn(store))
//     ).subscribe();

// 		this.machine$ = this.space.machine$;
//     this.log$ = this.machine$
// 			.pipe(map(m => m.log$), mergeAll());

// 		const count$ = this.space.machine$.pipe(
// 			flatMap(m => m.log$.pipe(
// 				ignoreElements(),
// 				startWith<number>(1),
// 			  endWith<number>(-1),
// 				)),
// 			scan((c, n) => c + n, 0));

// 		count$.pipe(
// 			takeWhile(c => c > 0),
// 			finalize(() => this.complete())
// 		).subscribe();
//   }

// 	complete() {
// 		this.signal$.next({ stop: true });
// 	}

//   async meet<R = any>(ids: Id[], convener: Convener<R>): Promise<R> {
// 		const machines = await gather(
// 			this.space.summon(Set(ids))
// 		);

//     return await this.mediator
//       .convene(convener, Set(machines));
//   }

//   tell(id: Id, m: any) {
//     return this.meet([id], {
// 			convene([p]) {
// 				return p.chat([m])
// 			}
// 		});
//   }

//   boot(id: Id, p: Phase<W>) {
//     return this.tell(id, p);
//   }
// }


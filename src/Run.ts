import { Id, PhaseMap, Phase, WorldImpl, Data, ContextImpl } from './lib'
import { Mediator, Convener } from './Mediator'
import { Observable, Subject, ReplaySubject } from 'rxjs'
import { flatMap, startWith, mergeAll, endWith, scan, takeWhile, finalize, map, toArray, ignoreElements } from 'rxjs/operators'
import { Set } from 'immutable'
import { MachineSpace, Emit, MachineLoader, Signal, Machine } from './MachineSpace'
import { buildDispatch, Dispatch } from './dispatch'
import AtomSpace from './AtomSpace'
const log = console.log;

export type LoaderFac<P> = (s: AtomSpace<Data>) => MachineLoader<P>

export class Run<W extends PhaseMap, X, P = Phase<W>> {
  readonly mediator: Mediator
	readonly atoms: AtomSpace<Data>
  readonly space: MachineSpace<W, X, P>
	readonly loader: MachineLoader<P>
	readonly signal$: Subject<Signal>

	readonly machine$: Observable<Machine<P>>
  readonly log$: Observable<Emit<P>>

  constructor(world: WorldImpl<W, X> & ContextImpl<X>, loaderFac: LoaderFac<P>) {
		this.signal$ = new ReplaySubject<Signal>(1);
    this.mediator = new Mediator(this.signal$);		
		this.atoms = new AtomSpace(this.signal$);
		this.loader = loaderFac(this.atoms);
    this.space = new MachineSpace(world, this.loader, <Dispatch<X, P>><unknown>buildDispatch(world.phases), this.mediator, this.signal$);

		this.machine$ = this.space.machine$;
    this.log$ = this.machine$
			.pipe(map(m => m.log$), mergeAll());

		const count$ = this.space.machine$.pipe(
			flatMap(m => m.log$.pipe(
				ignoreElements(),
				startWith<number>(1),
			  endWith<number>(-1),
				)),
			scan((c, n) => c + n, 0));

		count$.pipe(
			takeWhile(c => c > 0),
			finalize(() => this.complete())
		).subscribe();
  }

	complete() {
		this.signal$.next({ stop: true });
	}

  async meet<R = any>(ids: Id[], convener: Convener<R>): Promise<R> {
		const machines = await gather(
			this.space.summon(Set(ids))
		);

    return await this.mediator
      .convene(convener, Set(machines));
  }

  tell(id: Id, m: any) {
    return this.meet([id], {
			convene([p]) {
				return p.chat([m])
			}
		});
  }

  boot(id: Id, p: Phase<W>) {
    return this.tell(id, p);
  }
}

function gather<V>(v$: Observable<V>): Promise<V[]> {
	return v$.pipe(toArray()).toPromise();
}

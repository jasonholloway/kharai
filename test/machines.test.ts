import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, SpecWorld, makeWorld, World, WorldImpl, RunContext, Phase, PhaseMap, _Phase } from '../src/lib'
import { boot, Sink } from '../src/handler'
import { Subject, Observable } from 'rxjs'
import { gather } from './helpers'
import { tap, map } from 'rxjs/operators'
import { MeetSpace, Convener, Attendee } from '../src/Mediator'
import { Dispatch, buildDispatch } from '../src/dispatch'

describe('machines: running', () => {
	let loader: MachineLoader<World1>
	let space: MachineSpace<World1>
	let dispatch: Dispatch<World1['context'], Phase<World1>>
	let context: World1['context']

	beforeEach(() => {
		loader = async () => Set();
		dispatch = buildDispatch<World1['context'], World1['phases']>(world1.phases);

		//context to be populated in part by MachineSpace
		context = {
			async attach<R>(attend: Attendee<R>) { throw 666 },
			async convene<R>(ids: string[], convener: Convener<R>) { throw 333 }
		};
		
		space = new MachineSpace(world1, loader, dispatch, context, ['boot', []])
		space.log$.subscribe(console.log);
	})	

	it('run through phases', async () => {
		const starter: Convener<void> = {
			convene([p]) { p.chat(['dummy', 'start']) }
		}

		await space.meet(starter)(['bob1']);		

		const out = await gather(space.log$.pipe(tap(console.log)));

		expect(out).toEqual([
			['bob1', ['boot', []]],
			['bob1', ['dummy', ['start', []]]],
			['bob1', ['dummy', ['middle', 123]]],
			['bob1', ['dummy', ['end', 'byebye']]]
		]);
	})

	it('resumes', async () => {
		const starter: Convener<void> = {
			convene([p]) { p.chat(['fancy', 'start']) }
		}

		await space.meet(starter)(['fancy123']);		
		
		const out = await gather(space.log$.pipe(tap(console.log)));

		expect(out).toEqual(List([
			['fancy', 'start'],
			['delay', 10, 'fancy', 'end'],
			['delay', 10, 'fancy', 'end'],
			['fancy', 'end']
		]))
	})
	

	//TODO: meetings must update involved heads
	//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	type Template<Me extends World = World> = SpecWorld<{
		context: RunContext

		phases: {
			boot: []
			wait: [number, Phase<Me>]
			watch: [Id, string, Phase<Me>]
			
			dummy: {
				start: [],
				middle: [number]
				end: [string]
			}

			// fancy: {
			// 	start: [any]
			// 	end: [any]
			// }
		}
	}>

	type World1 = Template<Template>


	const world1 = makeWorld<World1>({
		phases: {
			boot: x => ({
				guard(d): d is [] { return true },
				async run() {

					const phase = await x.attach<Phase<World1>>({
						chat(c) { return c; } //should be checking this here...
					});

					console.log('received cmd', phase)

					if(phase) {
						return phase[0];
					}
					else {
						throw 'bad answer...';
					}
				}
			}),

			wait: x => ({
				guard(d): d is [number, Phase<World1>] { return true },
				async run() {
					return ['boot', []]
				}
			}),

			watch: x => ({
				guard(d): d is [Id, string, Phase<World1>] { return true },
				async run() {
					return ['boot', []]
				}
			}),

			dummy: {
				start: x => ({
					guard(d): d is [] { return true },
					async run() {
						return ['middle', [123]]
					}
				}),

				middle: x => ({
					guard(d): d is [number] { return true },
					async run([d]) {
						return ['end', [`the number is ${d}`]]
					}
				}),

				end: x => ({
					guard(d): d is [string] { return true },
					async run([d]) {
						console.log('message received:', d)
						return ['boot', []]
					}
				})
			}
		},
	})
})

describe('machines: loading and saving', () => {
	let atomSpace: AtomSpace<Data>
	let store: FakeStore
	let saver: AtomSaver<Data>

	beforeEach(() => {
		atomSpace = new AtomSpace();
		saver = new AtomSaver(new MonoidData(), atomSpace);
		store = new FakeStore(new MonoidData(), 3);
	})

	//...
})


type MachineLoader<P> = (ids: Set<Id>) => Promise<Set<[Id, P]>>


class MachineSpace<W extends World, PM extends PhaseMap = W['phases'], P = _Phase<PM>, X = W['context']> {
	private readonly world: WorldImpl<W>
	private readonly atoms: AtomSpace<Data>
	private readonly loader: MachineLoader<W>
	private readonly mediator: MeetSpace
	private readonly dispatch: Dispatch<X, P>
	private readonly x: X
	private readonly boot: P
	private runs: Map<Id, Promise<Run<X, P>>>

	private _log$: Subject<readonly [Id, P]>
	log$: Observable<readonly [Id, P]>

	constructor(world: WorldImpl<W>, loader: MachineLoader<W>, dispatch: Dispatch<X, P>, x: X, boot: P) {
		this.world = world;
		this.atoms = new AtomSpace();
		this.mediator = new MeetSpace();
		this.loader = loader;
		this.dispatch = dispatch;
		this.x = x;
		this.boot = boot;
		this.runs = Map();

		this._log$ = new Subject<readonly [Id, P]>();
		this.log$ = this._log$;
	}


	meet<R = any>(convener: Convener<R>): (ids: Id[]) => Promise<R> {
		return async (ids) => {
			const runs = await this.summon(Set(ids));
			return await this.mediator.mediate(convener, Set(runs))
		}
	}

	private async summon(ids: Set<Id>): Promise<Map<Id, IRun<P>>> {

		const summoned = ids.map(id => {
			const found = this.runs.get(id);
			if(found) {
				return [false, id, found] as const;
			}
			else {
		 		const run = new Run<X, P>();

		 		run.log$
		 			.pipe(map(l => [id, l] as const))
		 		  .subscribe(this._log$)
			
		 		run.begin(this.dispatch, this.x, this.boot);
			
		 		return [true, id, Promise.resolve(run)] as const;
			}
		})

		const toAdd = summoned
			.filter(([isNew]) => isNew)
			.map(([, id, loading]) => <[Id, Promise<Run<X, P>>]>[id, loading]);
    
		this.runs = this.runs.merge(Map(toAdd));

		const loadedAll =
			await Promise.all(
				summoned.map(([, id, loading]) =>
										 loading.then(r => <[Id, Run<X, P>]>[id, r])));

		return Map(loadedAll);
	}
}

class Run<X, P> implements IRun<P> {

	private _log$: Subject<P>
	log$: Observable<P>
	
	constructor() {
		this._log$ = new Subject<P>();
		this.log$ = this._log$;
	}

	begin(dispatch: Dispatch<X, P>, x: X, phase: P) {
		const sink = new Sink(this._log$);
		setImmediate(() => boot(dispatch, sink, x, phase))
	}
}

interface IRun<P> {
	readonly log$: Observable<P>
}


//---------------------------------

class MonoidData implements _Monoid<Data> {
  zero: Data = Map()
	add(a: Data, b: Data): Data {
		return a.merge(b);
  }
}

class FakeStore extends Store<Data> {
	saved: Data[] = []
	private _maxBatch: number;

	constructor(monoid: _Monoid<Data>, batchSize: number) {
		super(monoid);
		this._maxBatch = batchSize;
	}

	prepare(v: Data): {save():Promise<void>}|false {
		return v.count() <= this._maxBatch
			&& {
				save: () => {
					this.saved.push(v);
					return Promise.resolve();
				}
			};
	}
}

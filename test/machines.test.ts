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
import {delay} from '../src/util'

describe('machines: running', () => {
	let loader: MachineLoader<World1>
	let space: MachineSpace<World1>
	let dispatch: Dispatch<World1['context'], Phase<World1>>
	let context: World1['context']

	beforeEach(() => {
		loader = async () => Set();
		dispatch = buildDispatch(world1.phases);

		space = new MachineSpace(world1, loader, dispatch, ['boot', []])
		space.log$.subscribe(console.log);
	})	

	it('run through phases', async () => {
		const starter: Convener<void> = {
			convene([p]) { p.chat( [['dummy', ['start']]] ) }
		}

		await space.meet(starter)(['bob1']);		

		const out = await gather(space.log$);

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
		
		const out = await gather(space.log$);

		expect(out).toEqual(List([
			['fancy', 'start'],
			['delay', 10, 'fancy', 'end'],
			['delay', 10, 'fancy', 'end'],
			['fancy', 'end']
		]))
	})
	

	//TODO: meetings must update involved heads
	//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

	//if phases are to have layers, those at lower layers
	//are to 
	//

	
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

		contextFac: x => x,

		phases: {
			boot: x => ({
				guard(d): d is [] { return true },
				async run() {
					while(true) {
						const answer = await x.attach<Phase<World1>>({
							chat(c) { return c; } //should be checking this here...
						});

						if(answer) {
							return answer[0];
						}
						else {
							await delay(30); //when we release properly, this can be removed
						}
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
	private readonly boot: P
	private runs: Map<Id, Promise<Run<X, P>>>

	private _log$: Subject<readonly [Id, P]>
	log$: Observable<readonly [Id, P]>

	constructor(world: WorldImpl<W>, loader: MachineLoader<W>, dispatch: Dispatch<X, P>, boot: P) {
		this.world = world;
		this.atoms = new AtomSpace();
		this.mediator = new MeetSpace();
		this.loader = loader;
		this.dispatch = dispatch;
		this.boot = boot;
		this.runs = Map();

		this._log$ = new Subject<readonly [Id, P]>();
		this.log$ = this._log$;
	}

	private createContext(run: Run<X, P>): X {

		return this.world.contextFac({
			attach: <R>(attend: Attendee<R>) => {
				return this.mediator.attach(run, attend)
			},
			convene: async <R>(ids: Id[], convene: Convener<R>) => {
				const runs = await this.summon(Set(ids));
				return this.mediator.mediate(convene, Set(runs.values()));
			}
		});
	}


	meet<R = any>(convener: Convener<R>): (ids: Id[]) => Promise<R> {
		return async (ids) => {
			const runs = await this.summon(Set(ids));
			return await this.mediator
				.mediate(convener, Set(runs.values()))
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
			
		 		run.begin(this.dispatch, this.createContext.bind(this, run), this.boot);
			
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

	begin(dispatch: Dispatch<X, P>, contextFac: () => X, phase: P) {
		const sink = new Sink(this._log$);
		setImmediate(() => boot(dispatch, sink, contextFac, phase))
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

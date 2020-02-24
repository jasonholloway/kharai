import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, SpecWorld, makeWorld, World, WorldImpl, RunContext, Phase, PhaseMap, PhaseMapImpl, _Phase } from '../src/lib'
import { boot, Sink } from '../src/handler'
import { Subject, Observable } from 'rxjs'
import { gather } from './helpers'
import { tap, map } from 'rxjs/operators'
import { MeetSpace, Convener } from '../src/Mediator'

function buildDispatch<W extends World>(impl: PhaseMapImpl<W['context'], W['phases']>): Dispatch<Phase<W>> {
	throw 123;
}


describe('machines: running', () => {
	let loader: MachineLoader<World1>
	let space: MachineSpace<World1, World1['phases']>
	let dispatch: Dispatch<Phase<World1>>

	beforeEach(() => {
		loader = async () => Set();
		dispatch = buildDispatch<World1>(world1.phases);
		space = new MachineSpace(world1, loader, dispatch)
	})	

	it('run through phases', async () => {
		const space = new MachineSpace(world1, loader, dispatch);
		space.log$.subscribe(console.log);

		const starter: Convener<void> = {
			convene([p]) { p.chat(['dummy', 'start']) }
		}

		await space.meet(starter)(['dummy123']);		

		// const [run] = space.summon(['dummy', '123']);

		const out = await gather(space.log$.pipe(tap(console.log)));

		// const out = await gather(run.log$.pipe(tap(console.log)));

		expect(out).toEqual([
			['dummy', 'start'],
			['dummy', 'middle'],
			['dummy', 'end']
		]);
	})

	it('resumes', async () => {
		const space = new MachineSpace(world1, loader, dispatch);

		// const [run] = space.summon(['fancy', '123']); //but - you don't want to send a command to an already-running machine...
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
		contextFac(x) { //this shouldn't really have to be implemented here...
			return x;
		},

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
						return ['dummy', ['middle', [123] ]]
					}
				}),

				middle: x => ({
					guard(d): d is [number] { return true },
					async run([d]) {
						return ['dummy', ['end', [`the number is ${d}`]]]
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

	// 	machines: {
	// 		root: {
	// 			boot: x => ({
	// 				guard(d): d is void { return true },
	// 				run: async () => {
	// 					const cmd = await x.attach<Cmd<World1, 'root'>>({
	// 						chat(c) { return c; } //should be checking this here...
	// 					});

	// 					console.log('received cmd', cmd)

	// 					if(cmd) {
	// 						return cmd;
	// 					}
	// 					else {
	// 						throw 'bad answer...';
	// 					}
	// 				}
	// 			})
	// 		},

	// 		dummy: {
	// 			start: x => ({
	// 				guard(d): d is number { return true },
	// 				run: async () => {
	// 					return [['@me', 'middle']]
	// 				}
	// 			}),
	// 			middle: x => ({
	// 				guard(d): d is any { return true },
	// 				run: async () => [['@me', 'end']]
	// 			}),
	// 			end: x => ({
	// 				guard(d): d is any { return true },
	// 				run: async () => [] 
	// 			})
	// 		},

	// 		fancy: {
	// 			start: x => ({
	// 				guard(d): d is any { return true },
	// 				run: async () => [['@delay', 10, '@me', 'end']]
	// 			}),
	// 			end: x => ({
	// 				guard(d): d is any { return true },
	// 				run: async () => []
	// 			})
	// 		}
	// 	}
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

type Dispatch<P> = (inp: P) => Promise<P>


type MachineLoader<P> = (ids: Set<Id>) => Promise<Set<[Id, P]>>


class MachineSpace<W extends World, PM extends PhaseMap = W['phases'], P = _Phase<PM>> {
	private readonly world: WorldImpl<W>
	private readonly atoms: AtomSpace<Data>
	private readonly loader: MachineLoader<W>
	private readonly mediator: MeetSpace
	private readonly dispatch: Dispatch<P>
	private runs: Map<Id, Run<W>>

	private _log$: Subject<readonly [Id, P]>
	log$: Observable<readonly [Id, P]>

	constructor(world: WorldImpl<W>, loader: MachineLoader<W>, dispatch: Dispatch<P>) {
		this.world = world;
		this.atoms = new AtomSpace();
		this.mediator = new MeetSpace();
		this.loader = loader;
		this.dispatch = dispatch;
		this.runs = Map();

		this._log$ = new Subject<readonly [Id, P]>();
		this.log$ = this._log$;
	}


	meet<R = any>(convener: Convener<R>): (ids: Id[]) => Promise<R> {
		return async (ids) => {
			const runs = await this.load(ids);
			return await this.mediator.mediate(convener, Set(runs))
		}
	}

	// private async load(ids: Id[]): Promise<IRun<P>[]> {
	// 	//AND WHAT ABOUT ASYNC LOADING HERE????????????? - it will cause race cond
	// 	const summoned = Map(ids.map(id => {
	// 		const found = this.runs.get(id);
	// 		if(found) return [id, found];
	// 		else {
	// 			const head = this.atoms.spawnHead();

	// 			const run = new Run<P>();
	// 			run.log$
	// 				.pipe(map(l => [id, l] as const))
	// 			  .subscribe(this._log$)
				
	// 			run.boot(this.dispatch, ['boot']);
				
	// 			return [id, run];
	// 		}
	// 	}))

	// 	this.runs = this.runs.merge(summoned); //lots of needless churn
	// 	return [...summoned.values()];
	// }

	//below shouldn't be public; all should be via meet()
// 	summon<IR extends readonly Id[]>(...ids: IR): IRun<W, IR[number][0]>[] {
// 		const summoned = Map(ids.map(id => {
// 			const found = this.runs.get(id);
// 			if(found) return [id, found];
// 			else {
// 				const def = this.world.machines[id[0]];
// 				const head = this.atoms.spawnHead();

// 				const run = new Run();
// 				this._log$.next([id, run.log$]);
// 				run.boot(this.dispatch, [id[0], ...def.zero.resume]);
				
// 				return [id, run];
// 			}
// 		}))
// 		this.runs = this.runs.merge(summoned); //lots of needless churn
// 		return [...summoned.values()];
// 	}
}

class Run<W extends World, P = _Phase<W['phases']>> implements IRun<P> {

	private _log$: Subject<P>
	log$: Observable<P>
	
	constructor() {
		this._log$ = new Subject<P>();
		this.log$ = this._log$;
	}

	boot(dispatch: Dispatch<P>, phase: P) {
		const sink = new Sink(this._log$);
		setImmediate(() => boot(dispatch, sink, phase))
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

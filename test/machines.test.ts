import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, SpecWorld, makeWorld, World, Machine, PhaseKey, WorldImpl, MachineImpl, MachineState, MachineKey, Command, Yield, PhaseImpl, Phase, Cons, Prop } from '../src/lib'
import { createHandler, localize, compile, drive, Sink, Handler } from '../src/handler'
import { Observable } from 'rxjs/internal/Observable'
import { Subject } from 'rxjs'
import { RO } from './util'
import { gather } from './helpers'
import { tap } from 'rxjs/operators'



function buildMachine<W extends World, MK extends MachineKey<W>>(world: WorldImpl<W>, mk: MK) {

	const phaseImpls = world.machines[mk].phases;
	const p2 = Map(phaseImpls).mapKeys(k => <PhaseKey<Machine<W, MK>>>k)
	
	// const phases = Object.entries<PhaseImpl<W, MK, Phase<W, Machine<W, MK>, PhaseKey<Machine<W, MK>>>>>(world.machines[mk].phases);

	const handler: Handler = [...p2.entries()].map(([k, p]) => {
		return [k, async (s: string) => { console.log(s); return [] }] as const;
	})

	//
	//
	
	return localize(mk, handler);
}


describe('machines: running', () => {

	let loader: MachineLoader<World1>
	let dispatch: Dispatch

	beforeEach(() => {
		loader = async () => Set();
		dispatch = compile(buildMachine(world1, 'dummy'));
	})	

	it('run through phases', async () => {
		const space = new MachineSpace(world1, loader, dispatch);
		
		const [run] = space.summon(['dummy', '123']);

		const out = await gather(run.log$.pipe(tap(console.log)));

		expect(out).toEqual([
			['dummy', 'start'],
			['dummy', 'middle'],
			['dummy', 'end']
		]);
	})

	it('resumes', async () => {
		const space = new MachineSpace(world1, loader, dispatch);
		const gathering = gather(space.log$);

		const [run] = space.summon(['fancy', '123']); //but - you don't want to send a command to an already-running machine...
		
		//again, wait to complete here

		const out = await gathering;
		expect(out).toEqual(List([
			['fancy', 'start'],
			['delay', 10, 'fancy', 'end'],
			['delay', 10, 'fancy', 'end'],
			['fancy', 'end']
		]))
	})
	

	

	interface World1 extends SpecWorld<{
		context: {}

		extraCommand: [
			'blah'
		]

		handlers: {
			'@delay': [number, ...any[]],
			'@wait': [...any[]]
		}
		
		machines: {
			dummy: {
				phases: {
					start: { input: number }
					middle: { input: any }
					end: { input: any }
				}
			}

			fancy: {
				phases: {
					start: { input: any },
					end: { input: any }
				}
			}
		}
	}> {}

	const world1 = makeWorld<World1>({
		machines: {

			dummy: {
				zero: {
					data: {},
					resume: ['start']
				},
				phases: {
					start: {
						guard(d): d is number { return true },
						run: async () => [['dummy', 'middle']]
					},
					middle: {
						guard(d): d is any { return true },
						run: async () => [['@me', 'end']]
					},
					end: {
						guard(d): d is any { return true },
						run: async () => [] 
					}
				}
			},

			fancy: {
				zero: {
					data: {},
					resume: ['go', 'start']
				},
				phases: {
					start: {
						guard(d): d is any { return true },
						run: async () => [['@delay', 10, '@me', 'end']]
					},
					end: {
						guard(d): d is any { return true },
						run: async () => []
					}
				}
			}
		}
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


async function *runMachine<
	W extends World,
	K extends MachineKey<W>,
	M extends Machine<W, K> = Machine<W, K>>
	(machineKey: K, def: MachineImpl<W, K>, head: Head<Data>) {

		const handler = createHandler({
			async go(key: PhaseKey<M>, data: RO<MachineState<W, M>>) {
				const _phase = def.phases[key];
				if(!_phase) throw Error(`phase ${key} not found!`)
				if(!_phase.guard(data)) throw Error('guard failed');

				const cr = List(await _phase.run({}, data));
				//should update machine state here
				return [...cr];
			},
		});

		const local = localize('', handler);
		const dispatch = compile(local);
		dispatch
	}


type MachineLoader<W extends World> = (ids: Set<Id<W>>) => Promise<Set<[Id<W>, MachineState<W>]>>

type Dispatch<I extends Command = Command, O extends Command = Command> = (c: I) => Yield<O>

class MachineSpace<W extends World> {
	private readonly world: WorldImpl<W>
	private readonly atoms: AtomSpace<Data>
	private readonly loader: MachineLoader<W>
	private readonly dispatch: Dispatch
	private runs: Map<Id<W>, Run<W>>

	private _log$: Subject<[Id, Observable<Command>]>
	log$: Observable<[Id, Observable<Command>]>

	constructor(world: WorldImpl<W>, loader: MachineLoader<W>, dispatch: Dispatch) {
		this.world = world;
		this.atoms = new AtomSpace();
		this.loader = loader;
		this.dispatch = dispatch;
		this.runs = Map();

		this._log$ = new Subject<[Id, Observable<Command>]>();
		this.log$ = this._log$;
	}

	summon<IR extends readonly Id<W>[]>(...ids: IR): IRun<W, IR[number][0]>[] {
		const summoned = Map(ids.map(id => {
			const found = this.runs.get(id);
			if(found) return [id, found];
			else {
				const def = this.world.machines[id[0]];
				const head = this.atoms.spawnHead();

				const run = new Run();
				this._log$.next([id, run.log$]);
				run.boot(this.dispatch, [id[0], ...def.zero.resume]);
				
				return [id, run];
			}
		}))
		this.runs = this.runs.merge(summoned); //lots of needless churn
		return [...summoned.values()];
	}
}



class Run<W extends World, K extends MachineKey<W> = MachineKey<W>, M extends Machine<W, K> = Machine<W, K>> implements IRun<W, K> {
	private _log$: Subject<Command>
	log$: Observable<Command>
	
	constructor() {
		this._log$ = new Subject<Command>();
		this.log$ = this._log$;
	}

	boot(dispatch: Dispatch, command: Command) {
		const sink = new Sink(this._log$);
		setImmediate(() => drive(dispatch, sink, command))
	}
}

interface IRun<W extends World, K extends MachineKey<W>> {
	readonly log$: Observable<Command>
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


async function collect<V>(gen: AsyncIterable<V>): Promise<List<V>> {
	const collected: V[] = [];
	for await (let val of gen) collected.push(val);
	return List(collected)
}

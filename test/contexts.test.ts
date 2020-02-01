import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { isString } from 'util'
import { Id, Data, SpecWorld, makeWorld, World, Machine, PhaseKey, WorldImpl, Context, Command, Command, Yield, MachineImpl, MachineState, MachineKey, MachineSpec, CommandKey } from '../src/lib'



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

describe('machines: running', () => {
	
	it('run through phases', async () => {
		const space = new MachineSpace(world1, () => Promise.resolve(Set()));
		const machine = space.create(['dummy', '123']);

		const runner = new Coroutinizer(machine.handle());

		const phases = await collectPhases(runner.run(['phase', 'middle'])); //machine.boot()))

		expect(phases).toEqual(List(['start', 'middle', 'end']));
	})

	interface World1 extends SpecWorld<{
		context: {}
		
		machines: {
			dummy: {
				phases: {
					start: { input: number }
					middle: { input: any }
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
					resume: ['phase', 'start']
				},
				phases: {
					start: {
						guard(d): d is number { return true; },
						run: async () => Set([['phase', 'middle']])
					},
					middle: {
						guard(d): d is any { return true },
						run: async () => Set([['phase', 'end']])
					},
					end: {
						guard(d): d is any { return true; },
						run: async () => Set()
					}
				}
			}
		}
	})

	async function collectPhases<W extends World, M extends Machine<W>>(gen: AsyncIterable<Command<W>>) {
		const yields = await collect(gen);
		return yields
			.filter(([t]) => t == 'phase')
			.map(([,p]) => p);
	}

	async function collect<V>(gen: AsyncIterable<V>): Promise<List<V>> {
		const collected: V[] = [];
		for await (let val of gen) collected.push(val);
		return List(collected)
	}
})

type DelayerIn<W extends World, M extends Machine<W>> = 
	['delay', number, PhaseKey<M>]

class Delayer<W extends World> implements Hndlr<W> {
	create<M extends Machine<W>>(): HandlerImpl<W, Handler<W, 'delayer'>> {
		return {
			async delay([due, nextPhase]) {
				throw 123;
			}
		}
	}
}


type HookerIn<W extends World, M extends Machine<W>> =
	['hook', Id<W>, string, PhaseKey<M>]

class Hooker<W extends World> {
	handler<M extends Machine<W>>(): HandlerImpl<W, Handler<W, 'hooker'>> {
		return {
			async hook([id, predicate]) {
				throw 123;
			}
		}
	}
}

// class Resumer<W extends World> {
// 	private readonly world: WorldImpl<W>

// 	constructor(world: WorldImpl<W>) {
// 		this.world = world;
// 	}

// 	handler<M extends Machine<W>>(): Coroutinable<ResumeIn<W, M>> {
// 		const world = this.world;
// 		return {
// 			async resume([command]) {
// 				const [[key, body], phase] = command;

// 				const def = world.resumes[key];
// 				if(!def) throw Error('bad resume key!');
// 				if(!def.guard(body)) throw Error('bad resume body!');

// 				if(!await def.run(x, body)) {
// 					return Set([['end']])
// 				}

// 				return Set([['phase', phase]]);
// 			}
// 		}
// 	}
// }


interface IMachineHost<C1 extends Command, C2 extends Command> {
	boot(): C1
	run(): Yield<C2>
}


function createMachineHost<C1 extends Command, C2 extends Command>(host: IMachineHost<C1, C2>): IMachineHost<C1, C2> {
	return host;
}


const h = createMachineHost({
	boot() {
		return ['poo' as const] as const
	},
	async run() {
		return Set([['ploop' as const] as const])
	}
})




class MachineHost<W extends World, M extends Machine<W> = Machine<W>> {
	private def: MachineImpl<W, M>
	private state: MachineState<W, M>
	private head: Head<Data>

	constructor(def: MachineImpl<W, M>, state: Readonly<MachineState<W, M>>, head: Head<Data>) {
		this.def = def;
		this.state = state;
		this.head = head;
	}

	boot(): Command<W, M> {
		return this.state.resume;
	}
	
	// async run(x: Context<W>, phaseKey: PhaseKey<M>): Yield<Command<W, M>> {
	// 	const phase = this.def.phases[phaseKey];
	// 	const data = this.state.data;

	// 	if(!phase.guard(data)) {
	// 		throw Error('guard failed');
	// 	}
	// 	else {
	// 		return await phase.run(x, data);
	// 	}
	// }

	handle(): Handler<W, M> {


		return createHandler({});
		
		const _this = this;
		return {
			async phase([key]) {
				const phase = _this.def.phases[key];
				const data = _this.state.data;

				if(!phase.guard(data)) {
					throw Error('guard failed');
				}
				else {
					const resume = await phase.run({}, data);
					//should update machine state here

					return Set([
						['save', _this.head],
						// ['resume', resume]
					]);
				}
			}
		}
	}
}



function createHandler<W extends World, M extends Machine<W> = any>(handler: Handler<W, M>) {
	return handler;
}

type Handler<W extends World, M extends Machine<W>> = {
	[k:  CommandKey<W>]: () => Yield<W, M>
}




type MachineIn<W extends World, M extends Machine<W>> =
	['phase', PhaseKey<M>]

type In<W extends World, M extends Machine<W> = Machine<W>> =
		MachineIn<W, M>
	| DelayerIn<W, M>
	| HookerIn<W, M>
  | ['save', any]


class Coroutinizer<C extends Command> {
	private readonly map: Map<C[0], (c: Tail<C>) => Yield<C>> = Map()

	constructor(handlers: Coroutinable<C>) {
		this.map = Map(Object.entries(handlers))
	}

	async *run(boot: C): AsyncIterable<C> {
		let _in = Set([boot]);

		do {
			console.log(_in)

			const results = await Promise.all(
			  _in.map(async ([k, ...args]): Promise<Set<C>> => {
					const handler = this.map.get(k);
					return handler
					  ? await handler(<Tail<C>>args)
					  : Set();
				}))

			yield * _in

			_in = Set(results).flatMap(s => s);
			
		} while(!_in.isEmpty())
	}
}


type MachineLoader<W extends World> = (ids: Set<Id<W>>) => Promise<Set<[Id<W>, MachineState<W>]>>

class MachineSpace<W extends World> {
	private readonly world: WorldImpl<W>
	private readonly atoms: AtomSpace<Data>
	private readonly loader: MachineLoader<W>
	private cache: Map<Id<W>, MachineHost<W>>

	constructor(world: WorldImpl<W>, loader: MachineLoader<W>) {
		this.world = world;
		this.atoms = new AtomSpace();
		this.loader = loader;
		this.cache = Map();
	}

	create<K extends MachineKey<W>>([key, id]: Id<W, K>): MachineHost<W, Machine<W, K>> {
		const head = this.atoms.spawnHead();
		const def = this.world.machines[key];
		return new MachineHost(def, def.zero, head);
	}

	async summon<K extends MachineKey<W>>(ids: Set<Id<W, K>>): Promise<Set<MachineHost<W, Machine<W, K>>>> {
		return ids.map(([key, id]) => {
			const head = this.atoms.spawnHead();
			const def = this.world.machines[key];
			return new MachineHost(def, def.zero, head);
		});
	}
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



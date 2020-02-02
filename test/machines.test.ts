import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, SpecWorld, makeWorld, World, Machine, PhaseKey, WorldImpl, Yield, MachineImpl, MachineState, MachineKey, Command } from '../src/lib'
import { createHandler, compileCoroutine } from '../src/handler'

describe('machines: running', () => {
	
	it('run through phases', async () => {
		const space = new MachineSpace(world1, () => Promise.resolve(Set()));
		const machine = space.create(['dummy', '123']);

		const out = await collect(machine.run(['hello']))

		expect(out).toEqual(List(['start', 'middle', 'end']));
	})

	interface World1 extends SpecWorld<{
		context: {}

		extraCommand: ['blah']
		
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

	async function collectPhases<C extends Command>(gen: AsyncIterable<C>) : Promise<List<C extends ['phase', infer P] ? P : never>> {
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



function createMachineHandler<W extends World, M extends Machine<W>>(def: MachineImpl<W, M>, state: Readonly<MachineState<W, M>>, head: Head<Data>) {
	return createHandler({
	});
}

//but a resumption requiring a 'poke' from outside
//forms a coroutine outside of even its own puddle
//as in, the ball will be in the mediator's court
//the mediator will itself be just another listening handler
//
//the sending of messages from outside requires firstly a queue
//which could itself be an intermediate machine
//
//but primordially there will be the idea of immediate passing of the baton
//a queue canbe built on top of this
//
//via a tunnel, a machine can wait on the possiblity of an emittance to another
//so the injection of commands from outside comes via a special handler
//otherwise, we just boot with a single command

//so, dunno what summoning is needed? the resumer injected in to the coroutine will be a receptor
//will itself be the indexed part- and we don't need it now
//
//we will return only the iterator, then


async function *runMachine<W extends World, M extends Machine<W>>(def: MachineImpl<W, M>, state: Readonly<MachineState<W, M>>, head: Head<Data>) {

	const handler = createHandler({
		async phase([key]) {
			const phase = def.phases[key];
			const data = state.data;

			if(!phase.guard(data)) {
				throw Error('guard failed');
			}
			else {
				const resume = await phase.run({}, data);
				//should update machine state here

				return Set([
					['save', head],
					// ['resume', resume]
				]);
			}
		}
	});

	const dispatch = compileCoroutine(handler);

	return dispatch(state.resume);
}



type MachineLoader<W extends World> = (ids: Set<Id<W>>) => Promise<Set<[Id<W>, MachineState<W>]>>

class MachineSpace<W extends World> {
	private readonly world: WorldImpl<W>
	private readonly atoms: AtomSpace<Data>
	private readonly loader: MachineLoader<W>
	private activeIds: Set<Id<W>>

	constructor(world: WorldImpl<W>, loader: MachineLoader<W>) {
		this.world = world;
		this.atoms = new AtomSpace();
		this.loader = loader;
		this.activeIds = Set()
	}

	async summon(ids: Set<Id<W>>): Promise<Set<AsyncIterable<Command>>> {
		return ids
			.subtract(this.activeIds)
			.map(([key, id]) => {
				const head = this.atoms.spawnHead();
				const def = this.world.machines[key];
				return new MachineRunner(def, def.zero, head);
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



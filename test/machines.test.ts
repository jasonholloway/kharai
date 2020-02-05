import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, SpecWorld, makeWorld, World, Machine, PhaseKey, WorldImpl, MachineImpl, MachineState, MachineKey } from '../src/lib'
import { createHandler, localize, compile } from '../src/handler'

describe('machines: running', () => {
	
	it('run through phases', async () => {
		const space = new MachineSpace(world1, () => Promise.resolve(Set()));

		const [machine] = await space.summon(Set([['dummy', '123']]));
		const out = await collect(machine);

		expect(out).toEqual(List([
			['go', 'start'],
			['go', 'middle'],
			['go', 'end']
		]));
	})

	it('resumes', async () => {
		const space = new MachineSpace(world1, async () => Set());

		const [machine] = await space.summon(Set([['fancy', '123']]));
		const out = await collect(machine);

		expect(out).toEqual(List([
			['go', 'start'],
			['resume', ['delay', 10, ['go', 'end']]],
			['delay', 10, ['go', 'end']],
			['go', 'end']
		]))
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
					resume: ['phase', 'start']
				},
				phases: {
					start: {
						guard(d): d is number { return true; },
						run: async () => [['phase', 'middle'] as const]
					},
					middle: {
						guard(d): d is any { return true },
						run: async () => [['phase', 'end']]
					},
					end: {
						guard(d): d is any { return true; },
						run: async () => [] 
					}
				}
			},

			fancy: {
				zero: {
					data: {},
					resume: ['phase', 'start']
				},
				phases: {
					start: {
						guard(d): d is any { return true },
						run: async () => [['phase', 'start'] as const]  // [['resume', ['delay', 10, ['go', 'end']]] as const]
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


async function *runMachine<W extends World, M extends Machine<W>>(def: MachineImpl<W, M>, state: Readonly<MachineState<W, M>>, head: Head<Data>) {
	const handler = createHandler({
		async phase(key: PhaseKey<M>) {
			const _phase = def.phases[key];
			const data = state.data;

			if(!_phase.guard(data)) {
				// throw Error('guard failed');
				return [];
			}
			else {
				const cr = List(await _phase.run({}, data));
				//should update machine state here
				return [...cr];
			}
		},
	});

	const local = localize('bob', handler);
	const dispatch = compile(local);
	dispatch

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

	async summon<K extends MachineKey<W>>(ids: Set<Id<W, K>>) {//: Promise<Set<AsyncIterable<Command>>> {
		return (<Set<Id<W>>>ids)
			.subtract(this.activeIds)
			.map(([key, id]) => {
				this.activeIds = this.activeIds.add([key, id]);
				
				const head = this.atoms.spawnHead();
				const def = this.world.machines[key];

				return runMachine(def, def.zero, head); //should like load state here + boot with rsumption
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


async function collect<V>(gen: AsyncIterable<V>): Promise<List<V>> {
	const collected: V[] = [];
	for await (let val of gen) collected.push(val);
	return List(collected)
}

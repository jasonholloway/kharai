import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, SpecWorld, makeWorld, World, Machine, PhaseKey, WorldImpl, Yield, MachineImpl, MachineState, MachineKey, Command } from '../src/lib'
import { createHandler, compileCoroutine } from '../src/handler'
import { isString } from 'util'

describe('machines: running', () => {
	
	it('run through phases', async () => {
		const space = new MachineSpace(world1, () => Promise.resolve(Set()));

		const [machine] = await space.summon(Set([['dummy', '123']]));
		const out = await collectPhases(machine);

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


async function *runMachine<W extends World, M extends Machine<W>>(def: MachineImpl<W, M>, state: Readonly<MachineState<W, M>>, head: Head<Data>) {
	const handler = createHandler({
		async phase(key: PhaseKey<M>) {
			const phase = def.phases[key];
			const data = state.data;

			if(!phase.guard(data)) {
				throw Error('guard failed');
			}
			else {
				const resume = await phase.run({}, data);
				//should update machine state here

				const r = resume.union(Set([
					['save', head] as const
					// ['resume', resume]
				]));
				return r;
			}
		}
	});


	//dispatcher should take any command as input ********************
	//typings are passed around as Handler parameters
	const dispatch = compileCoroutine(handler);

	const [r0, r1] = state.resume;
	if(r0 === 'phase' && isString(r1)) {
		yield* dispatch([r0, r1]);
	}
	else {
		throw 'bad dispatch!';
	}
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



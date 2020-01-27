import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { isString, isArray } from 'util'

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
	let atomSpace: AtomSpace<Data>

	beforeEach(() => {
		atomSpace = new AtomSpace();
	})
	
	it('run through phases', async () => {
		const [space, run] = prepare(world1);
		const resumer = new Resumer(world1);

		const machine = space.create(['dummy', '123']);

		const phases = await collectPhases(run(machine, resumer, machine.boot()))

		expect(phases).toEqual(List(['start', 'middle', 'end']));
	})

	interface World1 extends SpecWorld<{
		context: {}
		resumes: {}
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
		resumes: {},
		machines: {
			dummy: {
				zero: {
					data: {},
					resume: 'start'
				},
				phases: {
					start: {
						guard(d): d is number { return true; },
						run: async () => 'middle'
					},
					middle: {
						guard(d): d is any { return true },
						run: async () => 'end'
					},
					end: {
						guard(d): d is any { return true; },
						run: async () => false
					}
				}
			}
		}
	})

	type Out<W extends World, M extends Machine<W>> =
			MachineOut<W, M>
		| ResumeOut<W, M>
	

	function prepare<W extends World>(world: WorldImpl<W>) {
		const space = new MachineSpace(world, () => Promise.resolve(Set()));
		return [space, run] as const;

		async function *run<M extends Machine<W>>(machine: MachineHost<W, M>, resumer: Resumer<W>, boot: Out<W, M>): AsyncIterable<Out<W, M>> {
			let machineRun: (x: Context<W>, p: PhaseKey<M>) => Yield<MachineOut<W, M>> = async () => Set()

			let _in = Set([boot]);

			do {
				let _out = Set();

				for await(let y of _in) {  //should be done in parallel
					switch(y[0]) {
						case 'resume':
							_out = _out.union(
								await resumer.run({}, y[1])
							);
							break;

						case 'phase':
							_out = _out.union(
								await machine.run({}, y[1])
							);
							break;
					}

					yield y;
				}

				_in = _out;
			} while(!_in.isEmpty())
		}
	}

	async function collectPhases<W extends World, M extends Machine<W>>(gen: AsyncIterable<Out<W, M>>) {
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




type Keyed<T> = { [key: string]: T }
type Keys<O> = keyof O & string;


type MachineSpec = {
	phases: Keyed<PhaseSpec>
}

type PhaseSpec = {
	input: any
}


type World = {
	context: any
	resumes: Keyed<any>
	machines: Keyed<MachineSpec>
}

type ResumeKey<W extends World> = Keys<W['resumes']>
type MachineKey<W extends World> = Keys<W['machines']>
type PhaseKey<M extends MachineSpec> = Keys<M['phases']>


type Id<W extends World = World, K extends MachineKey<W> = MachineKey<W>> = [K, string];



type WorldImpl<W extends World> = {
	resumes: {
		[K in ResumeKey<W>]: ResumeImpl<W, Resume<W, K>>
	}
	machines: {
		[K in MachineKey<W>]: MachineImpl<W, Machine<W, K>>
	}
}

type ResumeImpl<W extends World, R extends Resume<W> = Resume<W>> = {
	guard(r: R): r is R
	run(x: Context<W>, r: R): Promise<boolean>
}

type MachineImpl<W extends World, M extends Machine<W> = Machine<W>> = {
	zero: MachineState<W, M>,
	phases: {
		[K in PhaseKey<M>]: PhaseImpl<W, M, Phase<W, M, K>>
	}
}

type PhaseImpl<W extends World, M extends Machine<W>, P extends Phase<W, M>> = {
	guard(d: any): d is P['input'] 
	run(x: Context<W>, d: P['input']): Promise<ResumeCommand<W, M>>
}


type SpecWorld<W extends World> = W;

function makeWorld<W extends World>(w: WorldImpl<W>) {
	return w;
}

//so phase is expected to have a continuation with it
//how can the resumer populate this?
//it's kind of the point that it can't
//the resumer speaks its own language, just as machines speak their own language
//then the runner must fold them together, yielding a common language


type ResumeOut<W extends World, M extends Machine<W>> =
	  ['phase', PhaseKey<M>]
  | ['end']

type Yield<O> = Promise<Set<O>>

class Resumer<W extends World> {
	private readonly world: WorldImpl<W>

	constructor(world: WorldImpl<W>) {
		this.world = world;
	}
	
	async run<M extends Machine<W>>(x: Context<W>, resume: ResumeCommand<W, M>): Yield<ResumeOut<W, M>> {
		if(!resume) return Set([['end']]);
		else if(isString(resume)) {
			return Set([['phase', resume]]);
		}
		else {
			const [[key, body], phase] = resume;

			const def = this.world.resumes[key];
			if(!def) throw Error('bad resume key!');
			if(!def.guard(body)) throw Error('bad resume body!');

			if(!await def.run(x, body)) {
				return Set([['end']])
			}

			return Set([['phase', phase]]);
		}
	}
}


type Data = Map<string, any>

type MachineState<W extends World = World, M extends Machine<W> = Machine<W>> = {
	data: any
	resume: ResumeCommand<W, M>
}

type Context<W extends World> = W['context']
type Resume<W extends World, K extends ResumeKey<W> = ResumeKey<W>> = W['resumes'][K]
type Machine<W extends World, K extends MachineKey<W> = MachineKey<W>> = W['machines'][K]
type Phase<W extends World, M extends Machine<W>, K extends PhaseKey<M> = PhaseKey<M>> = M['phases'][K]

type ResumeCommand<W extends World, M extends Machine<W>> =
	  false
	| PhaseKey<M>
	| [
			({ [K in ResumeKey<W>]: [K, Resume<W, K>] }[ResumeKey<W>]),
			PhaseKey<M>
		]

type MachineOut<W extends World, M extends Machine<W> = Machine<W>> =
		['resume', ResumeCommand<W, M>]
  | ['save', Head<Data>]
  | ['end']

class MachineHost<W extends World, M extends Machine<W> = Machine<W>> {
	private def: MachineImpl<W, M>
	private state: MachineState<W, M>
	private head: Head<Data>

	constructor(def: MachineImpl<W, M>, state: Readonly<MachineState<W, M>>, head: Head<Data>) {
		this.def = def;
		this.state = state;
		this.head = head;
	}

	boot(): MachineOut<W, M> {
		return ['resume', this.state.resume];
	}
	
	async run(x: Context<W>, phaseKey: PhaseKey<M>): Yield<MachineOut<W, M>> {
		const phase = this.def.phases[phaseKey];
		const data = this.state.data;

		if(!phase.guard(data)) {
			throw Error('guard failed');
		}
		else {
			const resume = await phase.run(x, data);
			//should update machine state here

			return Set([
				['save', this.head],
				['resume', resume]
			]);
		}
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

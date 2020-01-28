import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { isString, isArray } from 'util'
import { Id, Data, SpecWorld, makeWorld, World, Machine, PhaseKey, WorldImpl, Context, ResumeCommand, MachineImpl, MachineState, MachineKey } from '../src/lib'
import { World1, world1 } from './worlds/World1'

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
		const resumer = new Resumer(world1);
		const machine = space.create(['dummy', '123']);
		const runner = new MachineRunner(machine, resumer);

		const phases = await collectPhases(runner.run(machine.boot()))

		expect(phases).toEqual(List(['start', 'middle', 'end']));
	})

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


type Out<W extends World, M extends Machine<W>> =
		MachineOut<W, M>
	| ResumeOut<W, M>


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

class MachineRunner<W extends World, M extends Machine<W>> {
	private readonly machine: MachineHost<W, M>
	private readonly resumer: Resumer<W>

	constructor(machine: MachineHost<W, M>, resumer: Resumer<W>) {
		this.machine = machine;
		this.resumer = resumer;
	}

	async *run(boot: Out<W, M>): AsyncIterable<Out<W, M>> {
		let _in = Set([boot]);

		do {
			let _out = Set();

			for await(let y of _in) {  //should be done in parallel
				switch(y[0]) {
					case 'resume':
						_out = _out.union(
							await this.resumer.run({}, y[1])
						);
						break;

					case 'phase':
						_out = _out.union(
							await this.machine.run({}, y[1])
						);
						break;
				}

				yield y;
			}

			_in = _out;
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

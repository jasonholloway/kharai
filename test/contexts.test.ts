import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { isString } from 'util'

describe('contexts and stuff', () => {
	let store: FakeStore
	let atomSpace: AtomSpace<Data>
	let space: MachineSpace<TestWorld>
	let saver: AtomSaver<Data>
	let resumer: Resumer<TestWorld>

	beforeEach(() => {
		store = new FakeStore(new MonoidData(), 3);
		atomSpace = new AtomSpace();
		space = new MachineSpace(testWorld, store);
		saver = new AtomSaver(new MonoidData(), atomSpace);
		resumer = new Resumer(testWorld);
	})
	
	it('machine run', async () => {
		const machine = space.create(['dummy', '123']);

		const phases = await collectPhases(runMachine({}, machine))

		expect(phases).toEqual(List(['blah', 'blah']));
	})



	type RunYield = readonly ['phase', string] | readonly ['save', any]

	async function collectPhases(gen: AsyncIterable<RunYield>) {
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

	async function *runMachine(x: Context<TestWorld>, machine: MachineHost<TestWorld>) : AsyncIterable<RunYield> {
		let [resume, run, saving] = machine.yield();
		if(saving) yield ['save', saving];
		
		while(true) {
			const phase = await resumer.run(x, resume);
			if(!phase) return;

			yield ['phase', phase];

			[resume, run, saving] = await run(x, phase);
			if(saving) yield ['save', saving];
		}
	}
	
})



type TestWorld = SpecWorld<{
	context: {}
	resumes: {
		delay: {}
	}
	machines: {
		dummy: {
			phases: {
				start: { input: number }
				middle: { input: any }
				finish: { input: any }
			}
		}
	}
}>


const testWorld = makeWorld<TestWorld>({
	resumes: {
		delay: {
			guard(body): body is {} { return true },
			run(x, body) { return Promise.resolve(true) }
		}
	},
	machines: {
		dummy: {
			zero: {
				data: {},
				resume: 'start'
			},
			phases: {
				start: {
					guard(d): d is number { return true; },
					async run(x, _) {
						return 'middle';
					}
				},
				middle: {
					guard(x): x is any { return true },
					async run() {
						return [['delay', {}], 'finish']
					}
				},
				finish: {
					guard(x): x is any { return true; },
					async run(_) { return false }
				}
			}
		}
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

type ResumeKeys<W extends World> = Keys<W['resumes']>
type MachineKeys<W extends World> = Keys<W['machines']>
type PhaseKeys<M extends MachineSpec> = Keys<M['phases']>


type Id<W extends World, K extends MachineKeys<W> = MachineKeys<W>> = [K, string];



type WorldImpl<W extends World> = {
	resumes: {
		[K in ResumeKeys<W>]: ResumeImpl<W, Resume<W, K>>
	}
	machines: {
		[K in MachineKeys<W>]: MachineImpl<W, Machine<W, K>>
	}
}

type ResumeImpl<W extends World, R extends Resume<W> = Resume<W>> = {
	guard(r: R): r is R
	run(x: Context<W>, r: R): Promise<boolean>
}

type MachineImpl<W extends World, M extends Machine<W> = Machine<W>> = {
	zero: MachineState<W, M>,
	phases: {
		[K in PhaseKeys<M>]: PhaseImpl<W, M, Phase<W, M, K>>
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



class Resumer<W extends World> {
	private readonly world: WorldImpl<W>

	constructor(world: WorldImpl<W>) {
		this.world = world;
	}
	
	async run<M extends Machine<W>>(x: Context<W>, resume: ResumeCommand<W, M>): Promise<string|false> {
		if(!resume) return false;
		if(isString(resume)) {
			return resume;
		}

		const [[key, body], phase] = resume;

		const def = this.world.resumes[key];
		if(!def) throw Error('bad resume key!');
		if(!def.guard(body)) throw Error('bad resume body!');

		if(!await def.run(x, body)) {
			return false;
		}

		return phase;
	}
}


type Data = Map<string, any>

type MachineState<W extends World, M extends Machine<W> = Machine<W>> = {
	data: any
	resume: ResumeCommand<W, M>
}

type Context<W extends World> = W['context']
type Resume<W extends World, K extends ResumeKeys<W> = ResumeKeys<W>> = W['resumes'][K]
type Machine<W extends World, K extends MachineKeys<W> = MachineKeys<W>> = W['machines'][K]
type Phase<W extends World, M extends Machine<W>, K extends PhaseKeys<M> = PhaseKeys<M>> = M['phases'][K]

type ResumeCommand<W extends World, M extends Machine<W>> =
	  false
	| PhaseKeys<M>
	| [
			({ [K in ResumeKeys<W>]: [K, Resume<W, K>] }[ResumeKeys<W>]),
			PhaseKeys<M>
		]



type MachineYield<W extends World, M extends Machine<W>> = readonly [ResumeCommand<W, M>, (x: Context<W>, p: string) => Promise<MachineYield<W, M>>, Promise<void>?]

class MachineHost<W extends World, M extends Machine<W> = Machine<W>> {
	private def: MachineImpl<W, M>
	private state: MachineState<W, M>
	private head: MachineHead

	constructor(def: MachineImpl<W, M>, state: Readonly<MachineState<W, M>>, head: MachineHead) {
		this.def = def;
		this.state = state;
		this.head = head;
	}

	yield(): MachineYield<W, M> {
		return [this.state.resume, this.run.bind(this)];
	}
	
	private async run(x: Context<W>, phaseKey: PhaseKeys<M>): Promise<MachineYield<W, M>> {
		const phase = this.def.phases[phaseKey];
		const data = this.state.data;

		if(!phase.guard(data)) {
			throw Error('guard failed');
		}
		else {
			const result = await phase.run(x, data);

			//now give the resume to the handler
			//GIVE TO RESUMER NOw
		}

		//perform...
		//get the behaviour from the spec
				
		const saving = this.head.save();
		return [false, this.run.bind(this), saving];
	}
}

class MachineHead {
	private head: Head<Data>
	private store: Store<Data>
	private saver: AtomSaver<Data>

	constructor(head: Head<Data>, store: Store<Data>, saver: AtomSaver<Data>) {
		this.head = head;
		this.store = store;
		this.saver = saver;
	}

	commit(val: Data): void {
		this.head.commit(val);
	}

	save(): Promise<void> {
		return this.saver.save(this.store, Set([this.head]));
	}
}

class MachineSpace<W extends World> {
	private readonly world: WorldImpl<W>
	private readonly store: Store<Data>
	private readonly atoms: AtomSpace<Data>
	private readonly saver: AtomSaver<Data>
	private cache: Map<Id<W>, MachineHost<W>>

	constructor(world: WorldImpl<W>, store: Store<Data>) {
		this.world = world;
		this.store = store;
		this.atoms = new AtomSpace();
		this.saver = new AtomSaver(new MonoidData(), this.atoms);
		this.cache = Map();
	}

	create<K extends MachineKeys<W>>([key, id]: Id<W, K>): MachineHost<W, Machine<W, K>> {
		const head = new MachineHead(this.atoms.spawnHead(), this.store, this.saver);
		const def = this.world.machines[key];
		return new MachineHost(def, def.zero, head);
	}

	async summon<K extends MachineKeys<W>>(ids: Set<Id<W, K>>): Promise<Set<MachineHost<W, Machine<W, K>>>> {
		return ids.map(([key, id]) => {
			const head = new MachineHead(this.atoms.spawnHead(), this.store, this.saver);
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

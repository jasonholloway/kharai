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
		space = new MachineSpace(testMachines, store);
		saver = new AtomSaver(new MonoidData(), atomSpace);
		resumer = new Resumer(testResumes);
	})
	
	it('machine run', async () => {
		const machine = space.create(['dummy', '123']);

		const logs = (await collect(runMachine({}, machine))).map(([l]) => l)

		expect(logs).toEqual(List(['blah', 'blah']));
	})

	async function collect<V>(gen: AsyncIterable<V>): Promise<List<V>> {
		const collected: V[] = [];
		for await (let val of gen) collected.push(val);
		return List(collected)
	}

	async function *runMachine(x: RunContext, machine: Machine<TestWorld>) {
		let [resume, run, saving] = machine.yield();
		if(saving) yield ['save', saving] as const;
		
		while(true) {
			const phase = await resumer.run(x, resume);
			if(!phase) return;

			yield ['phase', phase] as const;

			[resume, run, saving] = await run(x, phase);
			if(saving) yield ['save', saving] as const;
		}
	}
	
})




type RunContext = {
}


type TestResumes = SpecResumes<{
	delay: {},
}>

type TestMachines = SpecMachines<{
	dummy: {
		phases: {
			start: {
				input: number
			}
			middle: {
				input: any
			}
			finish: {
				input: any
			}
		}
	}
}>

type TestWorld = {
	context: RunContext
	resumes: TestResumes,
	machines: TestMachines
}


const testResumes = makeResumes<RunContext, TestWorld>({
	delay: {
		guard(body): body is {} { return true },
		run(x, body) { return Promise.resolve(true) }
	}
})

const testMachines = makeMachines<RunContext, TestWorld>({
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
				async run(_) {
					return [['delay', {}], 'finish']
				}
			},
			finish: {
				guard(x): x is any { return true; },
				async run(_) { return false }
			}
		}
	}
})



const testWorld = makeWorld<TestWorld>({
	resumes: testResumes,
	machines: testMachines
})









type Keyed<T> = { [key: string]: T }
type Keys<O> = keyof O & string;


type PhaseKeys<M extends MachineSpec> = Keys<M['phases']>
type MachineKeys<W extends WorldSpec> = keyof W['machines'] & string




type WorldSpec = {
	context: RunContext
	resumes: ResumeSpecs
	machines: MachineSpecs
}

type ResumeSpecs = Keyed<any>
type MachineSpecs = Keyed<MachineSpec>
type PhaseSpecs = Keyed<PhaseSpec>


type Id<W extends WorldSpec> = [MachineKeys<W>, string];

type Resume<M extends MachineSpec = MachineSpec, R extends ResumeSpecs = any> =
	  false
	| PhaseKeys<M>
	| [
			({ [K in keyof R]: K extends string ? [K, R[K]] : never }[keyof R]),
			PhaseKeys<M>
		]

type MachineSpec = {
	phases: PhaseSpecs
}

type PhaseSpec = {
	input: any
}



type WorldDef<W extends WorldSpec> = {
	resumes: ResumeDefs<W>
	machines: MachineDefs<W>
}

type MachineDefs<W extends WorldSpec> = {
	[K in MachineKeys<W>]: MachineDef<W['machines'][K], W['resumes']>
}

type ResumeDefs<W extends WorldSpec> = {
	[K in keyof W['resumes']]: ResumeDef<W['resumes'][K]>
}

type ResumeDef<T> = {
	guard(body: any): body is T
	run(x: RunContext, body: T): Promise<boolean>
}

type MachineDef<M extends MachineSpec = MachineSpec, R extends ResumeSpecs = ResumeSpecs> = {
	zero: MachineState<M, R>,
	phases: {
		[P in PhaseKeys<M>]: PhaseDef<M, M['phases'][P], R>
	}
}

type PhaseDef<M extends MachineSpec, P extends PhaseSpec, R extends ResumeSpecs> = {
	guard(d: any): d is P['input'] 
	run(x: RunContext, d: P['input']): Promise<Resume<M, R>>
}


type SpecResumes<R extends ResumeSpecs> = R;
type SpecMachines<M extends MachineSpecs> = M;
type SpecWorld<W extends WorldSpec> = W;





function makeWorld<W extends WorldSpec>(w: WorldDef<W>) {
	return w;
}

function makeResumes<X extends RunContext, W extends WorldSpec>(r: ResumeDefs<W>) {
	return r;
}

function makeMachines<X extends RunContext, W extends WorldSpec>(m: MachineDefs<W>) {
	return m;
}

class Resumer<W extends WorldSpec> {
	private readonly defs: ResumeDefs<W>

	constructor(defs: ResumeDefs<W>) {
		this.defs = defs;
	}
	
	async run<M extends MachineSpec>(x: RunContext, resume: Resume): Promise<string|false> {
		if(!resume) return false;
		if(isString(resume)) {
			return resume;
		}

		const [[key, body], phase] = resume;

		const def = this.defs[key];
		if(!def) throw Error('bad resume key!');
		if(!def.guard(body)) throw Error('bad resume body!');

		if(!await def.run(x, body)) {
			return false;
		}

		return phase;
	}
}


type Data = Map<string, any>

type MachineState<M extends MachineSpec = MachineSpec, R extends ResumeSpecs = any> = {
	data: any
	resume: Resume<M, R>
}



type MachineYield = readonly [Resume, (x: RunContext, p: string) => Promise<MachineYield>, Promise<void>?]

class Machine<W extends WorldSpec, K extends MachineKeys<W> = string> {
	private def: MachineDef<W['machines'][K], W['resumes']>
	private state: MachineState
	private head: MachineHead

	constructor(def: MachineDef<W['machines'][K], W['resumes']>, state: Readonly<MachineState>, head: MachineHead) {
		this.def = def;
		this.state = state;
		this.head = head;
	}

	yield(): MachineYield {
		return [this.state.resume, this.run.bind(this)];
	}
	
	private async run(x: RunContext, phaseKey: PhaseKeys<W['machines'][K]>): Promise<MachineYield> {
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

class MachineSpace<W extends WorldSpec> {  //   <MM extends MachineSpecs, R extends ResumeSpecs> {
	private readonly defs: MachineDefs<W>
	private readonly store: Store<Data>
	private readonly atoms: AtomSpace<Data>
	private readonly saver: AtomSaver<Data>
	private cache: Map<Id<W>, Machine<W, string>>

	constructor(defs: MachineDefs<W>, store: Store<Data>) {
		this.defs = defs;
		this.store = store;
		this.atoms = new AtomSpace();
		this.saver = new AtomSaver(new MonoidData(), this.atoms);
		this.cache = Map();
	}

	create([type, id]: Id<any>): Machine<W> { //should infer machine type here? or maybe not
		const head = new MachineHead(this.atoms.spawnHead(), this.store, this.saver);
		const def = this.defs[type];
		return new Machine(def, def.zero, head);
	}

	async summon(ids: Set<Id<W>>): Promise<Set<Machine<W>>> {
		return ids.map(([type, id]) => {
			const head = new MachineHead(this.atoms.spawnHead(), this.store, this.saver);
			const def = this.defs[type];
			return new Machine(def, def.zero, head);
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

import { Map, Set } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'

describe('contexts and stuff', () => {
	let store: FakeStore
	let atomSpace: AtomSpace<Data>
	let space: MachineSpace<TestMachines, TestResumes>
	let saver: AtomSaver<Data>
	let resumer: Resumer<TestResumes>

	beforeEach(() => {
		store = new FakeStore(new MonoidData(), 3);
		atomSpace = new AtomSpace();
		space = new MachineSpace(testMachines, store);
		saver = new AtomSaver(new MonoidData(), atomSpace);
		resumer = new Resumer(testResumes);
	})
	
	it('machine run', async () => {
		const machine = space.create(['dummy', '123']);

		const [resume1, next1, saving1] = machine.yield();
		await saving1;

		console.log(resume1);

		await resumer.handle(resume1);
		const [resume2, next2, saving2] = await next1({});
		await saving2;

		console.log(resume2);

		await resumer.handle(resume2);
		const [resume3, next3, saving3] = await next2({});
		await saving3;

		//...
	})
})


type RunContext = {}


type TestResumes = SpecResumes<{
	delay: {},
}>

type TestMachines = SpecMachines<{
	dummy: {
		phases: {
			start: {
				input: number
			},
			finish: {
				input: any
			}
		}
	}
}>



const testResumes = makeResumes<RunContext, TestResumes>({
	delay: {
		guard(body): body is {} { return true },
		run(x, body) { return Promise.resolve(true) }
	}
})

const testMachines = makeMachines<RunContext, TestMachines, TestResumes>({
	dummy: {
		zero: {
			phase: 'finish',
			data: {},
		},
		phases: {
			start: {
				guard(x): x is number { return true; },
				async run(_) { return ['end']; }
			},
			finish: {
				guard(x): x is any { return true; },
				async run(_) { return ['delay', {}] }
			}
		}
	}
})



type SpecResumes<R extends ResumeSpec> = R;
type SpecMachines<M extends MachineSpec> = M;



function makeResumes<X extends RunContext, R extends ResumeSpec>(r: ResumeDefs<R>) {
	return r;
}

function makeMachines<X extends RunContext, M extends MachineSpec, R extends ResumeSpec>(m: MachineDefs<M, R>) {
	return m;
}



type MachineDefs<M extends MachineSpec, R extends ResumeSpec> = {
	[K in keyof M & string]: MachineDef<M[K], R>
}

type ResumeDefs<R extends ResumeSpec> = {
	[K in keyof R & string]: ResumeDef<R[K]>
}



type ResumeDef<T extends ResumeType> = {
	guard(body: any): body is T
	run(x: RunContext, body: T): Promise<boolean>
}

type MachineDef<M extends MachineType = MachineType, R extends ResumeSpec = ResumeSpec> = {
	zero: Omit<MachineState<M, R>, 'resume'>,
	phases: {
		[P in keyof M['phases'] & string]: PhaseDef<M['phases'][P], R>
	}
}

type PhaseDef<T extends PhaseType, R extends ResumeSpec> = {
	guard(data: any): data is T['input'] 
	run(data: T['input']): Promise<Resume<R>>
}



type ResumeType = {
}

type MachineType = {
	phases: PhaseSpec
}

type PhaseType = {
	input: any
}



type ResumeSpec = {
	[type: string]: any
}

type MachineSpec = {
	[type: string]: MachineType
}

type PhaseSpec = {
	[type: string]: PhaseType
}


type Resume<R extends ResumeSpec = any> = ({ [K in keyof R]: [K, R[K]] }[keyof R]) | ['end']

type Type<M extends MachineSpec> = keyof M;
type Id<M extends MachineSpec> = [Type<M>, string];


class Resumer<R extends ResumeSpec> {
	private readonly defs: ResumeDefs<R>

	constructor(defs: ResumeDefs<R>) {
		this.defs = defs;
	}
	
	handle([key, body]: Resume): void {
		switch(key) {
			case 'end':
				//...
				return;

			default:
				const def = this.defs[key];
				if(!def) {
					throw Error('bad resume key!');
				}

				if(def.guard(body)) {
					(async () => {
						const proceed = await def.run({}, body);
						//such waiting on promise should accumulate somewhere
						//individual resumes should get a cancel token via the run context
					})();
				}
				else {
					throw Error('bad resume body!');
				}
		}
	}
}


type Data = Map<string, any>

type MachineState<M extends MachineType = MachineType, R extends ResumeSpec = any> = {
	data: any
	phase: keyof M['phases']
	resume: Resume<R>
}



type MachineYield = readonly [Resume, (x: RunContext) => Promise<MachineYield>, Promise<void>?]

class Machine<R extends ResumeSpec> {
	private def: MachineDef<MachineType, R>
	private state: MachineState
	private head: MachineHead

	constructor(def: MachineDef<MachineType, R>, state: MachineState, head: MachineHead) {
		this.def = def;
		this.state = state;
		this.head = head;
	}

	yield(): MachineYield {
		return [this.state.resume, x => this.run(x)];
	}
	
	private async run(x: RunContext): Promise<MachineYield> {
		const phase = this.def.phases[this.state.phase];
		const data = this.state.data;

		if(!phase.guard(data)) {
			throw Error('guard failed');
		}
		else {
			const result = await phase.run(data);

			//now give the resume to the handler
			//GIVE TO RESUMER NOw
		}

		//perform...
		//get the behaviour from the spec
				
		const saving = this.head.save();
		return [['end'], x => this.run(x), saving];
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

class MachineSpace<M extends MachineSpec, R extends ResumeSpec> {
	private readonly defs: MachineDefs<M, R>
	private readonly store: Store<Data>
	private readonly atoms: AtomSpace<Data>
	private readonly saver: AtomSaver<Data>
	private cache: Map<Id<M>, Machine<R>>

	constructor(defs: MachineDefs<M, R>, store: Store<Data>) {
		this.defs = defs;
		this.store = store;
		this.atoms = new AtomSpace();
		this.saver = new AtomSaver(new MonoidData(), this.atoms);
		this.cache = Map();
	}

	create([type, id]: Id<M>): Machine<R> { //should infer machine type here? or maybe not
		const head = new MachineHead(this.atoms.spawnHead(), this.store, this.saver);
		const def = this.defs[type];
		return new Machine(def, def.zero, head);
	}

	async summon(ids: Set<Id<M>>): Promise<Set<Machine<R>>> {
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

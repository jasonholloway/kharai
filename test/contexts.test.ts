import { Map, Set } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'

describe('contexts and stuff', () => {
	let store: FakeStore
	let atomSpace: AtomSpace<Data>
	let space: MachineSpace<TestMachines>
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

		await resumer.handle(resume1);
		const [resume2, next2, saving2] = await next1({});
		await saving2;

		await resumer.handle(resume2);
		const [resume3, next3, saving3] = await next2({});
		await saving3;

		//...
	})
})

//but resumptions are also saved to the machine, so the save can't be all done by the machine
//saving isn't in parallel with resume then, but kind of intertwined with it
//almost like the saveris middleware to the resume handler
//and yet and yet... the atoms do their saving as a big splodge
//
//the trad way is to keep the resumption state as part f the overall machine state, which is persisted as normal
//the special 'due' field is specially listened for by the special delay resumption
//but this also means it has to have some way of inveigling itself into saving state
//
//this state could be simply within the atom
//and tracked and saved the same as everything else in the state
//the difference is...
//


type RunContext = {}


type TestResumes = SpecResumes<{
	delay: {},
	end: {}
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
	end: {},
	delay: {}
})

const testMachines = makeMachines<RunContext, TestMachines, TestResumes>({
	dummy: {
		zero: {},
		phases: {
			start: {
				guard(x): x is number { return true; },
				async run(_) { return 'end'; }
			},
			finish: {
				guard(x): x is any { return true; },
				async run(_) { return 'delay' }
			}
		}
	}
})



type SpecResumes<R extends ResumeTypes> = R;
type SpecMachines<M extends MachineTypes> = M;



function makeResumes<X extends RunContext, R extends ResumeTypes>(r: ResumeDefs<R>) {
	return r;
}

function makeMachines<X extends RunContext, M extends MachineTypes, R extends ResumeTypes>(m: MachineDefs<M, R>) {
	return m;
}



type MachineDefs<M extends MachineTypes, R extends ResumeTypes = any> = {
	[T in keyof M]: MachineDef<M[T], R>
}

type ResumeDefs<R extends ResumeTypes> = {
	[T in keyof R]: ResumeDef<R[T]>
}



type ResumeDef<R extends ResumeType> = {
}

type MachineDef<M extends MachineType = MachineType, R extends ResumeTypes = {}> = {
	zero: any,
	phases: {
		[P in keyof M['phases']]: PhaseDef<M['phases'][P], R>
	}
}

type PhaseDef<T extends PhaseType, R extends ResumeTypes> = {
	guard(data: any): data is T['input'] 
	run(data: T['input']): Promise<keyof R>
}



type ResumeType = {
}

type MachineType = {
	phases: PhaseTypes
}

type PhaseType = {
	input: any
}



type ResumeTypes = {
	[type: string]: any
}

type MachineTypes = {
	[type: string]: MachineType
}

type PhaseTypes = {
	[type: string]: PhaseType
}




type Type<M extends MachineTypes> = keyof M;
type Id<M extends MachineTypes> = [Type<M>, string];


class Resumer<R extends ResumeTypes> {
	private readonly defs: ResumeDefs<R>

	constructor(defs: ResumeDefs<R>) {
		this.defs = defs;
	}
	
	handle(resume: keyof R): void {
		const def = this.defs[resume];
		//...
	}
}


type Resume = {
}

type Data = Map<string, any>

type MachineState = {
	data: {}
	phase: string
	resume: Resume
}



type MachineYield = [Resume, (x: RunContext) => Promise<MachineYield>, Promise<void>?]

class Machine {
	private def: MachineDef
	private state: MachineState
	private head: MachineHead

	constructor(def: MachineDef, state: MachineState, head: MachineHead) {
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
		return [{}, x => this.run(x), saving];
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

class MachineSpace<M extends MachineTypes> {
	private readonly defs: MachineDefs<M>
	private readonly store: Store<Data>
	private readonly atoms: AtomSpace<Data>
	private readonly saver: AtomSaver<Data>
	private cache: Map<Id<M>, Machine>

	constructor(defs: MachineDefs<M>, store: Store<Data>) {
		this.defs = defs;
		this.store = store;
		this.atoms = new AtomSpace();
		this.saver = new AtomSaver(new MonoidData(), this.atoms);
		this.cache = Map();
	}

	create([type, id]: Id<M>): Machine { //should infer machine type here? or maybe not
		const head = new MachineHead(this.atoms.spawnHead(), this.store, this.saver);
		const def = this.defs[type];
		return new Machine(def, def.zero, head);
	}

	async summon(ids: Set<Id<M>>): Promise<Set<Machine>> {
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

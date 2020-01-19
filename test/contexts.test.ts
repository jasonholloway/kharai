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

	beforeEach(() => {
		store = new FakeStore(new MonoidData(), 3);
		atomSpace = new AtomSpace();
		space = new MachineSpace(testMachines, store);
		saver = new AtomSaver(new MonoidData(), atomSpace);
	})
	
	it('machine run', async () => {
		const machine = space.create(['dummy', '123']);
		const [resume, saving] = await machine.run();

		//interpret resumption here
		//...

	})
})


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



const testResumes = makeResumes<TestResumes>({
	end: {},
	delay: {}
})

const testMachines = makeMachines<TestMachines, TestResumes>({
	dummy: {
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



function makeResumes<R extends ResumeTypes>(r: ResumeDefs<R>) {
	return r;
}

function makeMachines<M extends MachineTypes, R extends ResumeTypes>(m: MachineDefs<M, R>) {
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

type MachineDef<M extends MachineType, R extends ResumeTypes> = {
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




type Resume = {
}

type Data = Map<string, any>

type MachineState = {}

class Machine {
	private state: MachineState
	private head: MachineHead

	constructor(state: MachineState, head: MachineHead) {
		this.state = state;
		this.head = head;
	}
	
	async run(): Promise<[Resume, Promise<void>]> {
		//perform...
		const saving = this.head.save();
		return [{}, saving];
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
	private readonly spec: MachineDefs<M>
	private readonly store: Store<Data>
	private readonly atoms: AtomSpace<Data>
	private readonly saver: AtomSaver<Data>
	private cache: Map<Id<M>, Machine>

	constructor(spec: MachineDefs<M>, store: Store<Data>) {
		this.spec = spec;
		this.store = store;
		this.atoms = new AtomSpace();
		this.saver = new AtomSaver(new MonoidData(), this.atoms);
		this.cache = Map();
	}

	create(id: Id<M>): Machine { //should infer machine type here? or maybe not
		const state = {};
		const head = new MachineHead(this.atoms.spawnHead(), this.store, this.saver);
		return new Machine(state, head);
	}

	async summon(ids: Set<Id<M>>): Promise<Set<Machine>> {
		//load states here... (from db or cache)
		const states = Set([{}, {}]);

		return states.map(state => {
			const head = new MachineHead(this.atoms.spawnHead(), this.store, this.saver);
			return new Machine(state, head);
		});
	}

	//get a machine, run it, returning a resumption
	//then it's up to the caller 
	//...

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

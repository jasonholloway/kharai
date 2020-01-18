import { Map, Set } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'

describe('contexts and stuff', () => {
	const spec = new TestSpec();

	let store: FakeStore
	let atomSpace: AtomSpace<Data>
	let space: MachineSpace<TestSpec>
	let saver: AtomSaver<Data>

	beforeEach(() => {
		store = new FakeStore(new MonoidData(), 3);
		atomSpace = new AtomSpace();
		space = new MachineSpace(spec, store);
		saver = new AtomSaver(new MonoidData(), atomSpace);
	})
	
	it('machine run', async () => {
		const machine = space.create(['dummy', '123']);
		const [resumption, saving] = await machine.run();

		//interpret resumption here
		//...

	})
})

//Resumptions should parameterise Machines

class TestSpec implements MachineSpec<TestSpec, TestResumptions> {
	dummy = 'dummy' as const
}

class TestResumptions implements ResumptionSpec {
}


type MachineSpec<M extends MachineSpec<M, R>, R extends ResumptionSpec = any> = {
	[type: string]: any // MachineSpec<M>
}

type ResumptionSpec = {
	[type: string]: any
}


type Type<M extends MachineSpec<M>> = keyof M;
type Id<M extends MachineSpec<M>> = [Type<M>, string];

type MachineDef<M extends MachineSpec<M, R>, R extends ResumptionSpec> = Type<M>
type ResumptionDef = (...args: any[]) => void



type Resumption = {
}

type Data = Map<string, any>

type MachineState = {}

class Machine<S extends MachineSpec<S>> {
	private state: MachineState
	private head: MachineHead<S>

	constructor(state: MachineState, head: MachineHead<S>) {
		this.state = state;
		this.head = head;
	}
	
	async run(): Promise<[Resumption, Promise<void>]> {
		//perform...
		const saving = this.head.save();
		return [{}, saving];
	}
}

class MachineHead<S extends MachineSpec<S>> {
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

class MachineSpace<M extends MachineSpec<M>> {
	private readonly spec: M
	private readonly store: Store<Data>
	private readonly atoms: AtomSpace<Data>
	private readonly saver: AtomSaver<Data>
	private cache: Map<Id<M>, Machine<M>>

	constructor(spec: M, store: Store<Data>) {
		this.spec = spec;
		this.store = store;
		this.atoms = new AtomSpace();
		this.saver = new AtomSaver(new MonoidData(), this.atoms);
		this.cache = Map();
	}

	create(id: Id<M>): Machine<M> {
		const state = {};
		const head = new MachineHead(this.atoms.spawnHead(), this.store, this.saver);
		return new Machine(state, head);
	}

	async summon(ids: Set<Id<M>>): Promise<Set<Machine<M>>> {
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

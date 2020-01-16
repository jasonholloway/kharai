import { Map, Set } from 'immutable'
import { delay } from './helpers'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import { Atom, AtomRef } from '../src/atoms'
import AtomSpace from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'

describe('contexts and stuff', () => {
	let store: FakeStore
	let space: AtomSpace<string>
	let saver: AtomSaver<string>

	beforeEach(() => {
		store = new FakeStore(new MonoidString(), 3);
		space = new AtomSpace();
		saver = new AtomSaver(new MonoidString(), space);
	})

	it('context', async () => {
		const head = space.spawnHead();

		head.commit('123');
		
		//blah
	})
})

type Resumption = {
}

class Machine {
	run(): Promise<Resumption> {
		throw 123;
	}
}

class MachineSpace {

	private store: Store<string>
	private atoms: AtomSpace<string>

	constructor(store: Store<string>) {
		this.store = store;
		this.atoms = new AtomSpace();
	}

	load(): Machine {
		return new Machine();
	}

	//get a machine, run it, returning a resumption
	//then it's up to the caller 
	//...

}



//---------------------------------

type Table<V> = Map<string, V>

class MonoidTable<V> implements _Monoid<Table<V>> {
  zero: Table<V> = Map()
	add(a: Table<V>, b: Table<V>): Table<V> {
		return a.merge(b);
  }
}

class MonoidString implements _Monoid<string> {
  zero: string = ''
	add(a: string, b: string): string {
		return a + b;
  }
}

//---------------------------------

class FakeStore extends Store<string> {
	saved: string[] = []
	private _maxBatch: number;

	constructor(monoid: _Monoid<string>, batchSize: number) {
		super(monoid);
		this._maxBatch = batchSize;
	}

	prepare(v: string): {save():Promise<void>}|false {
		return v.length <= this._maxBatch
			&& {
				save: () => {
					this.saved.push(v);
					return Promise.resolve();
				}
			};
	}
}

import { Map } from 'immutable'
import AtomSpace, { Head } from '../src/AtomSpace'
import { Data } from '../src/lib'


describe('committable', () => {

	let space: AtomSpace<Data>

	beforeEach(() => {
		space = new AtomSpace();
	})

	it('commits singly', async () => {
		const h1 = space.spawnHead();
		const h2 = space.spawnHead();

		const commit = new Committer(h1);

		await commit.complete(Map({ blah: 123 }));
		
		expect(h1.ref().resolve().val).toEqual({})
	})
	
})

class Committer {

	private readonly head: Head<Data>

	constructor(head: Head<Data>) {
		this.head = head;
	}

	async complete(d: Data): Promise<void> {}

	static create(...heads: Head<Data>[]): Committer {
		throw 123;
	}

	static combine(...cs: Committer[]): void {
	}
	
}

import { Set } from 'immutable'
import { Head } from '../src/AtomSpace'
import { Data } from '../src/lib'
import { AtomRef, Atom, AtomLike } from '../src/atoms'

//below is what MachineSpace deals in
interface IParty {
	head: Head<Data>
	barter(): [string, ...any[]]
}


function conjoin(heads: Head<Data>[], v: Data) {
	const upstreams: AtomRef<Data>[] = [];
	const sinks: ((newAtom: AtomLike<Data>)=>void)[] = [];

	for(const head of heads) {
		head.join((ref, sink) => {
			upstreams.push(ref);
			sinks.push(sink);
		})
	}

	const sharedAtom = new Atom(Set(upstreams), v);

	for(const sink of sinks) {
		sink(sharedAtom);
	}
}




describe('mediator', () => {

	it('mediates', async () => {

		const p1 = {
			head: undefined,
			barter() { throw 123; }
		}

		const p2 = {
			head: undefined,
			barter() { throw 123; }
		}

		const atom = await mediate(p1, p2)
		
		
		
	})
	
})

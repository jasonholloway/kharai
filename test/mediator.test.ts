import { Set } from 'immutable'
import Locks from '../src/Locks';


describe('mediator', () => {

	let space: MeetSpace

	beforeEach(() => {
		space = new MeetSpace();
	})
	

	it('mediates', async () => {
		const p1 = {
		}

		const p2 = {
		}

		const convening = space.convene(Set([p1, p2]));

		space.attach(p1);
		space.attach(p2);

		const convened = await convening;
		
		//
		//
		//
	})
})


interface Peer {
	say(message: any): Promise<any>
}

interface Party {
	// convene(peers: Set<Peer>) //peers drop out as they emit their choices
}

class MeetSpace {
	private locks = new Locks(0);

  async convene(parties: Set<Party>) {
		const lock = await this.locks.lock(...parties);
		try {
			//but what if one is not attached yet?
			//we can only gain the lock of one registered with us

			//almost like lock should be inverted: locked by default, released on a whim
			//instead of resources being implicitly available - they must be made available
			//
			
			//actual negotiating here
			//resources become available and each time all waiters have a chance
			//one by one to claim the resources they need; if not available the they go back
			//and wait on further events
		}
		finally {
			lock.release();
		}
	}

	async attach(party: Party) {
		const handle = await this.locks.inc([party], 1);

		//but what if an incrementer releases as another has a lock?
		//then suddenly the lock can't really hold
		//the release of an increment should really be async as well - releasing is not always possible!
		//not immediately, anyway
		//...

		handle.release();
	}
}

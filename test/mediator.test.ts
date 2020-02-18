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

		const p3 = {
		}

		const convening = space.convene(p1, Set([p2, p3]));

		//which one goes first though?
		//they all need to attach before the meeting begins
		//
		//except, one will initiate the conversation - how will it go about doing that?
		//it will actively meet, not just listen via attachment.
		//it will /convene/ - with a special handler to initiate discussion
		//
		//firing the initial challenge is different from handling a challenge
		//though, after the initial firing, the flow is very similar, in that reponses will then be fired
		//
		//even so, attachers must offer themselves to the convener, which can only be done by the common locking mechanism
		//
		//adding availability requires adding something to entry's list of resources
		//it's the inidividual token, which is offered as something new
		//but then these aren't actually kept track of inside the lock - the lock just keeps track of numbers being added to, subtrascted from

		//when gaining a lock, then we will catch a glimpse of that lock's state - it's our special synchronization opportunity
		//
		//

		const att2 = space.attach(p2, m => ['no']);
		const att3 = space.attach(p3, m => ['no']);

		const convened = await convening;

		await att2;
		await att3;
	})
})


interface Peer {
	say(message: any): Promise<any>
}

interface Party {
	// convene(peers: Set<Peer>) //peers drop out as they emit their choices
}

type Chat = [string, ...any[]]

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

	async attach(party: Party, handler: (i: Chat) => Chat) {
		const incr = await this.locks.inc([party], 1);

		//and now our handler is somehow stored somewhere
		//so that convene can see it
		//
		//incrementing will always succeed here: but having upped the lock count,
		//we now need to somehow offer ourself to the convener
		//this has to be via a map
		//
		//though - if there were such a thing as LockContext, we'd be away here...
		//each party having contributed to the lock gets to suggest an arbitrary context
		//visible by other lockers
		//
		//so - we'd offer a convening context in incrementing ythe lock
		//if the lock didn't tot up bare numbers, but items - 
		//
		

		//attaches and waits till handler says 'no more'
		//at which point we return to the calling scope

		// await incr.release();
	}
}

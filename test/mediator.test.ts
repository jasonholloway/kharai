import { Set } from 'immutable'
import Locks, { Exchange } from '../src/Locks';


describe('mediator', () => {

	let space: MeetSpace

	beforeEach(() => {
		space = new MeetSpace();
	})
	

	it('mediates', async () => {
		const p1 = {
			id: 'p1',
			call() { throw 123 },
			reply() { throw 123 }
		}

		const p2 = {
			id: 'p2',
			reply() { throw 123 }
		}

		const p3 = {
			id: 'p3',
			reply() { throw 123 }
		}

		const convening = space.convene(p1, Set([p2, p3]));

		const att2 = space.attach(p2, p2);
		const att3 = space.attach(p3, p3);

		const convened = await convening;

		await att2;
		await att3;
	})
})

interface Party {
	id: Id,
	reply(chat: Chat): Chat
}

interface Convener extends Party {
	call(parties: Set<Party>): Chat //peers drop out as they emit their choices
}

type Id = string

type Chat = [string, ...any[]]

class MeetSpace {
	private locks = new Exchange<Party>();

  async convene(convener: Convener, others: Set<object>) {
		const claim = await this.locks.claim(...others);
		try {
			const convened = claim.offers();
			convener.call(convened);
		}
		finally {
			await claim.release();
		}
	}

	async attach(item: object, party: Party) {
		const handle = await this.locks.offer([item], party);
		try {
			//not sure if there's much to do here
			//...
		}
		finally {
			await handle.release();
		}
	}
}

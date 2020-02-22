import { Set } from 'immutable'
import { Exchange } from '../src/Locks';

describe('mediator', () => {
	let space: MeetSpace

	beforeEach(() => {
		space = new MeetSpace();
	})

	it('convention occurs', async () => {
		const p1: Convener<Set<any>> = {
			convene(peers) {
				const reply = peers.flatMap(p => p.chat(['hello']) || []);
				return reply;
			},
		}

		const p2: Attendee<string> = {
			chat(m) {
				return [`${m}2`, 'reply2'];
			}
		}

		const p3: Attendee<string> = {
			chat(m) {
				return [`${m}3`, 'reply3'];
			}
		}

		const meeting1 = space.convene(p1, Set([p2, p3]));
		const meeting2 = space.attach(p2, p2);
		const meeting3 = space.attach(p3, p3);

		const result1 = await meeting1;
		expect(result1).toEqual(Set(['reply2', 'reply3']));

		const result2 = await meeting2;
		expect(result2).toEqual(['hello2']);
		
		const result3 = await meeting3;
		expect(result3).toEqual(['hello3']);
	})
})

interface Peer {
	chat(m: any): false|[any]
}

interface Convener<R = any> {
	convene(peers: Set<Peer>): R
}

interface Attendee<R = any> {
	chat(m: any, peers: Set<Peer>): [R]|[R, any]
}


class MeetSpace {
	private locks = new Exchange<Peer>();

  async convene<R>(convener: Convener<R>, others: Set<object>): Promise<R> {
		const claim = await this.locks.claim(...others);
		try {
			const peers = claim.offers();
			const answer = convener.convene(peers);
			return answer;
		}
		finally {
			await claim.release();
		}
	}

	async attach<R>(item: object, attend: Attendee<R>): Promise<false|[R]> {
		let _active = true;
		let _return: false|[R] = false;
		
		const handle =
			await this.locks.offer([item],
				{
					chat(m: any) {
						if(_active) {
							const [state, reply] = attend.chat(m, Set());
							_return = [state];

							if(reply !== undefined) {
								return [reply];
							}
						}

						return _active = false;
					}
				});
	
		await handle.release();

		return _return;
	}
}

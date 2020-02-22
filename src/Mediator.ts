import { Exchange } from './Locks'
import { Set } from 'immutable'

export interface Peer {
	chat(m: any): false|[any]
}

export interface Convener<R = any> {
	convene(peers: Set<Peer>): R
}

export interface Attendee<R = any> {
	chat(m: any, peers: Set<Peer>): [R]|[R, any]
}

export class MeetSpace {
	private locks = new Exchange<Peer>();

  async mediate<R>(convener: Convener<R>, others: Set<object>): Promise<R> {
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

	async attach<R>(item: object, attend: Attendee<R>): Promise<false|[R]> { //instead of returning false, should relock, retry till we get result
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

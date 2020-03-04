import { Exchange, Lock } from './Locks'
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

export class Mediator {
	private locks = new Exchange<Peer>();

  async convene<R>(convener: Convener<R>, others: Set<object>): Promise<R> {
		const claim = await this.locks.claim(...others);
		try {
			const peers = claim.offers(); //peer interface needs to be wrapped here, to remove special messages
			const answer = convener.convene(peers);

			//only live peers should be bothered here - maybe its up to the peers themselves; they will return head when done
			peers.forEach(p => {
				const a = p.chat(false); //should be better, more inscrutable value here
				if(a) throw Error('peer responded badly to kill');
			});

			//bothered peers will return their heads here, their contexts
			//to be passed back to the convener along with the local result
			//
			//so attendees do their talking, and eventually return their 'false'
			//maybe it should be a pre-swap; but - the convener does not always want these heads;
			//it's like the uber-convener who accumulates them
			//and only if an attendee is implicated will it pool its head
			//
			//and what happens to the head after this? it is joined together with others, eating up a shared monoidal value
			//but this monoidal value is yielded not by the mediator at all, but very much by the machine
			//some kind of context must be yielded by each peer that is then used to do the head-updating
			//
			//each machine contributes the monoidal state and head; the common Committer receives these; but when does it commit?
			//seems that we have a CommitContext, that takes heads and values, and commits them as one to the AtomSpace
			//
			//on communication, these CommitContexts would somehow mingle; and only when all parties had released the context would it actually be committed to the tree
			//attendees would pass their contexts to the convener, who receiving them would combine them, and 
			//
			//so CommitContexts then, existing in series: exactly like Heads as it happens. A head could combine to have many parents; but heads are also used for saving purposes
			//if we had HeadRefs, that were owned by machines, but this is exactly what a head is already...
			//a head is a reference to an atom; the shared Committer would update these references
			//
			//so, the shared context needs to do ref counting
			//and when it is transparently joined with another, the two become inextricably linked
			//the context needs a facade that redirects to a shared inner that does the real combining
			//
			
			console.log('convener :>', answer)
			return answer;
		}
		finally {
			await claim.release();
		}
	}

	async attach<R>(item: object, attend: Attendee<R>): Promise<false|[R]> { //instead of returning false, should relock, retry till we get result
		let _state: false|[R] = false;
		
		const handle = await new Promise<Lock>((resolve, reject) => {
			let _go = true;
			const _handle = this.locks.offer([item],
				{
					chat(m: false|[any]) {
						try {
							console.log('attendee <-', m)
							if(!_go) return false;
							if(!m) {
								resolve(_handle);
								return _go = false;
							}

							const [state, reply] = attend.chat(m, Set());
							_state = [state];

							if(reply === undefined) {
								resolve(_handle);
								return _go = false;
							}
							else {
								return [reply];
							}
						}
						catch(err) {
							reject(err);
							return _go = false;
						}
					}
				});
		})
	
		await handle.release();
		console.log('attendee :>', _state);

		return _state;
	}
}

import { Set } from 'immutable'
import { Mediator, Convener, Attendee } from '../src/Mediator'
import { delay } from '../src/util'
import { empty } from 'rxjs/internal/observable/empty'

describe('mediator', () => {
	let space: Mediator

	beforeEach(() => {
		space = new Mediator(empty());
	})

	it('simplest convene/attach', async () => {
		const p1: Convener<string> = {
			convene([peer]) {
				const [reply] = peer.chat(['hello']) || [];
				return reply;
			}
		}

		const p2: Attendee<string> = {
			chat() { return ['banana', 'pineapple']; }
		}

		const convening = space.convene(p1, Set([p2]));
		const attaching = space.attend(p2, p2);


		// convening.then(console.log)
		// attaching.then(console.log)

		expect(await convening).toEqual('pineapple');
		expect(await attaching).toEqual(['banana']);
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
		const meeting2 = space.attend(p2, p2);
		const meeting3 = space.attend(p3, p3);

		const result1 = await meeting1;
		expect(result1).toEqual(Set(['reply2', 'reply3']));

		const result2 = await meeting2;
		expect(result2).toEqual(['hello2']);
		
		const result3 = await meeting3;
		expect(result3).toEqual(['hello3']);
	})

	it('attendee doesn\'t immediately release', async () => {
		const attendee: Attendee<true> = {
			chat() { return [true] }
		}

		const attending = space.attend(attendee, attendee);

		let released = false;
		attending.then(() => released = true);

		await delay(50);
		expect(released).toBeFalsy();
	})

	it('attendee released after chat', async () => {
		const convener: Convener<number> = {
			convene([peer]) {
				peer.chat(['hello']);
				return 1;
			}
		}

		const attendee: Attendee<number> = {
			chat() { return [1] }
		}

		const convening = space.convene(convener, Set([attendee]));
		const attending = space.attend(attendee, attendee);

		let released = false;
		attending.then(() => released = true);

		await convening;
		await attending;

		expect(released).toBeTruthy();
	})





	//but the attendee can only be released when the mediator tells it so
	//it doesn't unilaterally quit - instead it just skulks until its told to go
	//the mediator must have the power to do this stuff, as it wrpas both attendee and convener

	//the protocol: convener can only truly quit once all active peers have quit
	//as convener closes, it sends out final 'kill' messages, and expects false replies from all
	//if something doesn't return false then at this point we must throw error

	//---
	//can two machines try to attach to each other and get stuck?
	//rather - can two machines try to convene each other and get stuck?
	//presumably, yes - each one is waiting for the other to make first move
	//in this case, it would be better for there to be no hard distinciton between convener and attendee
	//both could offer themselves (rather both would try locking the other)
	//
	//there would then be only one kind of locking: not the offer/claim kind, but rather simple locking of all parties
	//but then how would this be synchronised? same as now - all parties would offer themselves with their intended partners
	//but this kind of locking would still require an offering-up, we couldn't lock up the unsuspecting; they'd still need to 
	//offer...
	//
	//so, in starting a machine, there'd be no problem, as we'd be locking a dummy object
	//the other would still have to offer itself for locking under this plan
	//
	//but if two conveners intersected? then both would magically lock; though with no prioritybetween them
	//which one would convene? which one would be treated as attaching?
	//allowing mutual convention would open up peers trying to tell each other about things horizontally,
	//instead of hierarchical top-down; load-balancing maybe? instead of a central scheduler, jobs could be shared between 
	//common parties
	//
	//---
	//
	//so here we have the thought again that we could have a more equinaminous system
	//but there always has to be a pole to organise around, some commonly-known token, a point of orientation
	//different peers would try to organise around a commonly-known point
	//when two became known to each other, then each would have a choice as to what to do...
	//
	//they would know nothing more than that another machine was about - but the machines themselves would still need states
	//and therefore ids
	//
	//but there's no need for the meeting point to have the same name as a machine - it could be a separate id
	//could this point even have state? potentially - you could certainly build such a point out of a purely passive component
	//addressable by the usual means
	//
	//except that in attaching oneself, there's no control, no given threshhold of how many we want to attach to - the combining is solely done by the convener
	//this other pattern would say, here I am - come and find me by convening me, at my address
	//but then the attachee would be able to say - I need at least two others to mediate them
	//and then the actual convening would be done by the original attachee...
	//
	//but the two conveners in this case would both know they want to be mediated...
	//and in this case, they could actually send each other handlers
	//and some overlay protocol could achieve this
	//
	//except for the fact that the two conveners would be at loggerheads
	//in claiming, their claims should be compatible: they want to mediate with a set number of others

	//if one wants one, but another wants two, what then?
	//then the one that wants one will wait till another that wants one appears
	//almost like the parties offer and claim at the same time: they will either attach or convene
	//but the attachment in this case would also come with a condition

	//attachers can be choosy
	//the only way currently to get multiple contacts at once is to convene
	//and the convener needs to know all the target ids from above; ie it needs to know the ids of its underlings
	//whereas we want the underlings to arrange themselves to receive

	//but the underling can convene from below, taking the initiative to talk to a distributor node
	//and here the distributor will choose to give it a value
	//maybe it could even tell it about peers it can talk to, though the protocol here grows in woolliness

	//we want two things to be able to talk without knowing expressly about each other, as directly as possible
	//two things would therefore try to convene the same target; each would simultaneously offer an attacher, and try to convene on the same
	//a two-pronged approach: and only one convener would succeed, and only one attacher; both parties would therefore need two-part split handlers

	//this would allow groups of two to co-convene, but larger groups? attachment needs to be conditional too to allow this, and can be done with a slight exapnsion of the lock

	//so, the primitives we have already are exactly that - primitives, on which the rest can be constructed
	//we can go ahead with what we have then
	//which is: the mediator's injected, wrapping handlers will talk to each other, ensuring all involved parties complete at the end of a communication
	
})


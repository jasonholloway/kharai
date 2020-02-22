import { Set } from 'immutable'
import { MeetSpace, Convener, Attendee } from '../src/Mediator'

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

		const meeting1 = space.mediate(p1, Set([p2, p3]));
		const meeting2 = space.attach(p2, p2);
		const meeting3 = space.attach(p3, p3);

		const result1 = await meeting1;
		expect(result1).toEqual(Set(['reply2', 'reply3']));

		const result2 = await meeting2;
		expect(result2).toEqual(['hello2']);
		
		const result3 = await meeting3;
		expect(result3).toEqual(['hello3']);
	})

	xit('heads conjoined', async () => {
		//some kind of combining of context needed
		//...
	})
})


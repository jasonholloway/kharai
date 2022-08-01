import { Set } from 'immutable'
import { EMPTY } from 'rxjs'
import { Mediator, MConvener, MAttendee } from '../src/Mediator'
import { delay } from '../src/util'

describe('mediator', () => {
  let x: Mediator

  beforeEach(() => {
    x = new Mediator(EMPTY);
  })

  it('simplest convene/attach', async () => {
    const p1: MConvener<string> = {
      id: 'a',
      convened([peer]) {
        const [reply] = peer.chat(['hello']) || [];
        return <string>reply;
      }
    }

    const p2: MAttendee<string> = {
      id: 'b',
      attended() { return ['banana', 'pineapple']; }
    }

    const convening = x.convene(p1, Set([p2]));
    const attaching = x.attend(p2, p2);

    expect(await convening).toEqual('pineapple');
    expect(await attaching).toEqual(['banana']);
  })

  it('convention occurs', async () => {
    const p1: MConvener<Set<any>> = {
      id: 'a',
      convened(peers) {
        const reply = peers.flatMap(p => p.chat(['hello']) || []);
        return reply;
      },
    }

    const p2: MAttendee<string> = {
      id: 'b',
      attended([,m]) {
        return [`${m}2`, 'reply2'];
      }
    }

    const p3: MAttendee<string> = {
      id: 'c',
      attended([,m]) {
        return [`${m}3`, 'reply3'];
      }
    }

    const meeting1 = x.convene(p1, Set([p2, p3]));
    const meeting2 = x.attend(p2, p2);
    const meeting3 = x.attend(p3, p3);

    const result1 = await meeting1;
    expect(result1).toEqual(Set(['reply2', 'reply3']));

    const result2 = await meeting2;
    expect(result2).toEqual(['hello2']);
    
    const result3 = await meeting3;
    expect(result3).toEqual(['hello3']);
  })

  it('attendee doesn\'t immediately release', async () => {
    const attendee: MAttendee<true> = {
      id: 'a',
      attended() { return [true] }
    }

    const attending = x.attend(attendee, attendee);

    let released = false;
    attending.then(() => released = true);

    await delay(50);
    expect(released).toBeFalsy();
  })

  it('attendee released after chat', async () => {
    const convener: MConvener<number> = {
      id: 'a',
      convened([peer]) {
        peer.chat(['hello']);
        return 1;
      }
    }

    const attendee: MAttendee<number> = {
      id: 'b',
      attended() { return [1] }
    }

    const convening = x.convene(convener, Set([attendee]));
    const attending = x.attend(attendee, attendee);

    let released = false;
    attending.then(() => released = true);

    await convening;
    await attending;

    expect(released).toBeTruthy();
  })

  it('conveners in series', async () => {
    const c1: MConvener<string> = {
      id: 'c1',
      convened([p]) {
        const r = p.chat(['yo']);
        return 'done';
      },
    }

    const c2: MConvener<string> = {
      id: 'c2',
      convened([p]) {
        const r = p.chat(['boo']);
        return 'done';
      },
    }

    const a: MAttendee<string> = {
      id: 'a',
      attended([mid]) {
        return [mid];
      }
    }

    const convention1 = x.convene(c1, Set([a]));
    const result1 = await x.attend(a, a);
    expect(result1).toEqual(['c1']);
    
    const convention2 = x.convene(c2, Set([a]));
    const result2 = await x.attend(a, a);
    expect(result2).toEqual(['c2']);
  })

  it('conveners in parallel', async () => {
    const c1: MConvener<string> = {
      id: 'c1',
      convened([p]) {
        const r = p.chat(['yo']);
        return 'done';
      },
    }

    const c2: MConvener<string> = {
      id: 'c2',
      convened([p]) {
        const r = p.chat(['boo']);
        return 'done';
      },
    }

    const a: MAttendee<string> = {
      id: 'a',
      attended([mid]) {
        return [mid];
      }
    }

		//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//the conveners both have their lockers queued up top
		//by the time the attendee wants to release
		//tis too late: lock processes further claimants first
		//and the offer suffers, protected only by its gnarly go flag
		//
		//TODO
		//an offerer release should be top priority, gazumping all others <!!!
		//!!!

    const convention1 = x.convene(c1, Set([a]));
    const convention2 = x.convene(c2, Set([a]));

    const result1 = await x.attend(a, a);
    expect(result1).toEqual(['c1']);
    
    const result2 = await x.attend(a, a);
    expect(result2).toEqual(['c2']);
  })
})


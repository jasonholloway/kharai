import { delay } from "../src/util";
import { AttemptImpl } from "../src/Attempt";

describe('attempts', () => {

  it('success', async () => {
    const a = AttemptImpl.succeed(7);
    expect(await a.assert()).toBe(7);

    const b = a.then(i => i.toString());
    expect(await b.assert()).toBe('7');
  })

  it('acts like promise', async () => {
    const a = AttemptImpl.succeed(7);
    expect(await a).toBe(7);

    const b = a.then(i => i.toString());
    expect(await b).toBe('7');
  })

  it('async flows skip on fail', async () => {
    let finished = 0;

    const a = AttemptImpl.succeed(7);

    (async () => {
      const x = await a.then(() => { throw 'woof' });
      finished++;
    })().catch(() => {});

    (async () => {
      const x = await a.then(() => AttemptImpl.fail());
      finished++;
    })();

    expect(finished).toBe(0);
  })

  it('asserts success', async () => {
    const a = AttemptImpl.succeed(7);
    expect(await a.assert()).toBe(7);

    const b = AttemptImpl.succeed(7).then(i => i * 2);
    expect(await b.assert()).toBe(14);
  })

  it('assert throws', async () => {
    const a = AttemptImpl.fail();
    expect(a.assert()).rejects.toBe('Assertion on failed attempt');

    const b = AttemptImpl.fail().then(_ => 123);
    expect(b.assert()).rejects.toBe('Assertion on failed attempt');
  })

  it('defaults via orElse', async () => {
    const a = await AttemptImpl.fail().orElse(7);
    expect(a).toBe(7);
  })

  it('calls finally, even after failure', async () => {
    let called = 0;

    AttemptImpl.succeed(1).finally(() => called++).finally(() => called++);
    
    AttemptImpl.fail().finally(() => called++).finally(() => called++);

    await delay(30);

    expect(called).toBe(4);
  })

  //obvs more to be tested/implemented!
  //eg catch could return an Attempt
  //and cancellations could be tested also...
})



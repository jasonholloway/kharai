import { describe, expect, it } from '@jest/globals';
import { delay } from "../src/util";
import { AttemptImpl } from "../src/Attempt";

describe('attempts', () => {

  it('success', async () => {
    const a = AttemptImpl.succeed(7);
    expect(await a.ok()).toBe(7);

    const b = a.map(i => i.toString());
    expect(await b.ok()).toBe('7');
  })

  it('can be mapped', async () => {
    const a = await AttemptImpl
      .succeed(7)
      .map(i => i * 2)
      .map(i => i + 1)
      .ok();

    expect(a).toBe(15);
  })

  it('can be flatmapped', async () => {
    const a = await AttemptImpl
      .succeed(7)
      .flatMap(i => AttemptImpl.succeed(3))
      .ok();

    expect(a).toBe(3);
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
    expect(await a.ok()).toBe(7);

    const b = AttemptImpl.succeed(7).map(i => i * 2);
    expect(await b.ok()).toBe(14);
  })

  it('assert throws', async () => {
    const a = AttemptImpl.fail();
    expect(a.ok()).rejects.toBe('Assertion on failed attempt');

    const b = AttemptImpl.fail().map(_ => 123);
    expect(b.ok()).rejects.toBe('Assertion on failed attempt');
  })

  it('defaults via else', async () => {
    const a = await AttemptImpl.fail().else(7);
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



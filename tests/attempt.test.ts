import { describe, expect, it } from '@jest/globals';
import { delay } from "../src/util";
import { Attempt } from "../src/Attempt";

describe('attempts', () => {

  it('success', async () => {
    const a = Attempt.succeed(7);
    expect(await a.ok()).toBe(7);

    const b = a.map(i => i.toString());
    expect(await b.ok()).toBe('7');
  })

  it('can be mapped', async () => {
    const a = await Attempt
      .succeed(7)
      .map(i => i * 2)
      .map(i => i + 1)
      .ok();

    expect(a).toBe(15);
  })

  it('can be flatmapped', async () => {
    const a = await Attempt
      .succeed(7)
      .flatMap(i => Attempt.succeed(3))
      .ok();

    expect(a).toBe(3);

    const b = await Attempt
      .succeed(7)
      .flatMap(() => Attempt.fail())
      .else(1);

    expect(b).toBe(1);
  })

  it('acts like promise, exposing inner wrapping', async () => {
    const a = Attempt.succeed(7);
    expect(await a).toEqual([7]);

    const b = a.map(i => i.toString());
    expect(await b).toEqual(['7']);

    const c = Attempt.fail();
    expect(await c).toBe(false);
  })

  it('async flows skip on fail', async () => {
    let finished = 0;

    const a = Attempt.succeed(7);

    (async () => {
      const x = await a.then(() => { throw 'woof' });
      finished++;
    })().catch(() => {});

    (async () => {
      const x = await a.then(() => Attempt.fail());
      finished++;
    })();

    expect(finished).toBe(0);
  })

  it('asserts success', async () => {
    const a = Attempt.succeed(7);
    expect(await a.ok()).toBe(7);

    const b = Attempt.succeed(7).map(i => i * 2);
    expect(await b.ok()).toBe(14);
  })

  it('assert throws', async () => {
    const a = Attempt.fail();
    expect(a.ok()).rejects.toBe('Assertion on failed attempt');

    const b = Attempt.fail().map(_ => 123);
    expect(b.ok()).rejects.toBe('Assertion on failed attempt');
  })

  it('defaults via else', async () => {
    const a = await Attempt.fail().else(7);
    expect(a).toBe(7);
  })

  it('calls finally, even after failure', async () => {
    let called = 0;

    Attempt.succeed(1).finally(() => called++).finally(() => called++);
    
    Attempt.fail().finally(() => called++).finally(() => called++);

    await delay(30);

    expect(called).toBe(4);
  })

  //obvs more to be tested/implemented!
  //eg catch could return an Attempt
  //and cancellations could be tested also...
})



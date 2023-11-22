import { describe, expect, it } from '@jest/globals';
import { incl } from '../shape/common';
import { World } from '../shape/World';
import { Str } from '../guards/Guard'
import simpleSet from './simpleSet'
import FakeStore from '../FakeStore';
import { newRun } from '../Run';
import { delay } from '../util';

describe('stringSet', () => {

  const w = World
    .shape({
      strs: incl(simpleSet(Str))
    });

  it('accumulates unique values', async () => {
    const store = new FakeStore(10);
    const run = newRun(w.build(), store, store);

    await run.session(async () => {
      const m = await run.summon(['@M_strs']);

      const r0 = await m.tell(['add', 'hello']);
      expect(r0).toEqual([true]);

      const r1 = await m.tell(['add', 'hello']);
      expect(r1).toEqual([true]);

      const r2 = await m.tell(['add', 'jason']);
      expect(r2).toEqual([true]);
    });

    await delay(50);

    expect(store.saved.get('@M_strs'))
      .toEqual(['M_strs_run', ['hello','jason']]);
  })
})

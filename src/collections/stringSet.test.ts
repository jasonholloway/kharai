import { incl } from '../shape/common';
import { World } from '../shape/World';
import stringSet from './stringSet'
import FakeStore from '../FakeStore';
import { newRun } from '../Run';
import { delay } from '../util';

describe('stringSet', () => {

  const w = World
    .shape({
      strs: incl(stringSet())
    });

  it('accumulates strings into set', async () => {
    const store = new FakeStore(10);
    const run = newRun(w.build(), store, store);

    await run.session(async () => {
      const m = await run.summon(['@M_strs']);

      const r0 = await m.tell(['put', 'hello']);
      expect(r0).toEqual([true]);

      const r1 = await m.tell(['put', 'hello']);
      expect(r1).toEqual([true]);

      const r2 = await m.tell(['put', 'jason']);
      expect(r2).toEqual([true]);
    });

    await delay(50);

    expect(store.saved.get('@M_strs'))
      .toEqual(['M_strs_run', { hello: true, jason: true }]);
  })

  it('deletes from set', async () => {
    const store = new FakeStore(10);
    const run = newRun(w.build(), store, store);

    await run.session(async () => {
      const m = await run.summon(['@M_strs']);

      const r0 = await m.tell(['put', 'hello']);
      expect(r0).toEqual([true]);

      const r1 = await m.tell(['put', 'jason']);
      expect(r1).toEqual([true]);

      const r2 = await m.tell(['delete', 'jason']);
      expect(r2).toEqual([true]);

      const r3 = await m.tell(['has', 'jason']);
      expect(r3).toEqual([false]);

      const r4 = await m.tell(['has', 'hello']);
      expect(r4).toEqual([true]);
    });

    await delay(50);

    expect(store.saved.get('@M_strs'))
      .toEqual(['M_strs_run', { hello: true, jason: false }]);
  })
})

// you choose your communication contract...
// which somehow gets dispatched against the summoned machine
//
//
//

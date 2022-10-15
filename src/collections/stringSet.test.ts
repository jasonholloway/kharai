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

  it('accumulates strings into store', async () => {
    const store = new FakeStore(10);
    const run = newRun(w.build(), store, store);

    await run.session(async () => {
      const m = await run.summon(['@strs']);

      const r0 = await m.tell(['add', 'hello']);
      expect(r0).toEqual([true]);

      const r1 = await m.tell(['add', 'hello']);
      expect(r1).toEqual([true]);

      const r2 = await m.tell(['add', 'jason']);
      expect(r2).toEqual([true]);
    });

    await delay(50);

    expect(store.saved.get('@strs'))
      .toEqual(['strs_run', { hello: true, jason: true }]);
  })
})

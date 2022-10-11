import { incl } from '../shape/common';
import { World } from '../shape/World';
import { Str } from '../guards/Guard'
import simpleSet from './simpleSet'
import FakeStore from '../FakeStore';
import { newRun } from '../Run';

describe('simpleSet', () => {

  const w = World
    .shape({
      strs: incl(simpleSet(Str))
    });

  it('does something', async () => {
    const store = new FakeStore(10);
    const run = newRun(w.build(), store, store);
    
    const [logs] = await Promise.all([
      run.log$.toPromise(),
      (async () => {
        const m = await run.summon(['@strs']);
        await m.tell(['add', 'hello']);
      })()
    ]);
    
    console.log('hello!!!!!')
  })

})

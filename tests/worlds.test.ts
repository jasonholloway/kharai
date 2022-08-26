import _Monoid from '../src/_Monoid'
import { act } from '../src/shape/common';
import { World } from '../src/shape/World';
import { createRunner } from './shared'
import { Num } from '../src/guards/Guard'

const pigs = World
  .shape({
    oink: act(Num)
  })
  .impl({
    async oink({and}) {
      return and.end('oinked');
    }
  });

const world = World
  .shape({
    hello: act()
  })
  .impl({
    async hello() {
      return false;
    }
  })
  .mergeWith(pigs);

describe('worlds', () => {

  it('run through phases', async () => {
    const x = createRunner(world.build());
    
    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('bob', ['oink', 1])
    ]);

    expect(logs).toEqual([
      ['bob', ['boot']],
      ['bob', ['oink', 1]],
      ['bob', ['end', 'oinked']],
    ]);
  })
})

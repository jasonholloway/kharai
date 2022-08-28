import _Monoid from '../src/_Monoid'
import { act } from '../src/shape/common';
import { World } from '../src/shape/World';
import { createRunner } from './shared'
import { Str } from '../src/guards/Guard'

const animal = (says:string) =>
  World
    .shape({
      hello: act(),
      walk: act(Str)
    })
    .impl({
      async hello({and}) {
        return and.walk(says);
      },

      async walk({and}, d) {
        return and.end(d);
      }
    });

//TODO
//returned phases need prepending too

const world = World
  .with(animal('oink').atPath('pig'))
  .with(animal('woof').atPath('dog'))
  .shape({
    speakToAnimals: act()
  })
  .impl({
    async speakToAnimals({and}) {
      return and.pig.hello();
    }
  });

describe('worlds', () => {

  it('run through phases', async () => {
    const x = createRunner(world.build());
    
    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('bob', ['speakToAnimals'])
    ]);

    expect(logs).toEqual([
      ['bob', ['boot']],
      ['bob', ['speakToAnimals']],
      ['bob', ['pig_hello']],
      ['bob', ['pig_walk', 'oink']],
      ['bob', ['end', 'oink']],
    ]);
  })
})

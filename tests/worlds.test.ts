import _Monoid from '../src/_Monoid'
import { act } from '../src/shape/common';
import { World } from '../src/shape/World';
import { createRunner } from './shared'

const animal = <N extends string>(name:N, says:string) =>
  World
    .shape({
      hello: act()
    })
    .impl({
      async hello({and}) {
        return and.end(says);
      }
    })
    .atPath(name);


const world = World
  .with(animal('pig', 'oink'))
  .with(animal('dog', 'woof'))
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
      ['bob', ['end', 'oink']],
    ]);
  })
})

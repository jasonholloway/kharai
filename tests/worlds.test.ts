import _Monoid from '../src/_Monoid'
import { act, incl } from '../src/shape/common';
import { World } from '../src/shape/World';
import { createRunner } from './shared'
import { Str } from '../src/guards/Guard'
import { inspect } from 'util'

const animal = (says:string) =>
  World
    .shape({
      hello: act(Str),
      responds: act()
    })
    .impl({
      async hello({and}, d) {

        console.debug(inspect(and,{depth:5}))
        
        return and.responds();
      },

      async responds({and}) {
        return and.end(says);
      }
    });


const world =
  World
    .shape({
      pig: incl(animal('oink')),
      dog: incl(animal('woof')),

      speakToAnimals: act(Str),
    })
    .impl({
      async speakToAnimals({and}, greeting) {
        return and.pig.hello(greeting);
      }
    });


describe('worlds', () => {

  it('run through phases', async () => {
    const x = createRunner(world.build());
    
    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('bob', ['speakToAnimals', 'hullo!'])
    ]);

    expect(logs).toEqual([
      ['bob', ['boot']],
      ['bob', ['speakToAnimals', 'hullo!']],
      ['bob', ['pig_hello', 'hullo!']],
      ['bob', ['pig_responds']],
      ['bob', ['end', 'oink']],
    ]);
  })
})

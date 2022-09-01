import _Monoid from '../src/_Monoid'
import { act, incl } from '../src/shape/common';
import { World } from '../src/shape/World';
import { createRunner } from './shared'
import { Str } from '../src/guards/Guard'
import { Simplify } from './util';

const animal = (says:string) =>
  World
    .shape({
      hello: act(Str),
      responds: act()
    })
    .impl({
      async hello({and}, d) {
        return and.responds();
      },

      async responds({and}) {
        return and.end(says);
      }
    });

const genericThing = <T>(t:T) => {
  const w = World
    .shape({
      oof: act(t),
      wow: act()
    });

  type R = typeof w;
  type _ = R

  w.nodes

  return w.impl({
    async oof({and}, d) {
      return false;
    }
  });
}


const world =
  World
    .shape({
      pig: incl(animal('oink')),

      blub: incl(genericThing(123)),
      // dog: incl(animal('woof')),

      meow: act(),

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

import _Monoid from '../src/_Monoid'
import { act, incl, root } from '../src/shape/common';
import { World } from '../src/shape/World';
import { createRunner } from './shared'
import { Guard, Narrowable, Str } from '../src/guards/Guard'

const animal = (says:string) =>
  World
    .shape({
      hello: root(Str),
      responds: act()
    })
    .impl({
      async hello({and,ref}, d) {
        ref
        return and.responds();
      },

      async responds({and}) {
        return and.end(says);
      }
    })
    .seal();

const genericThing = <T>(t:Guard<T>) => {
  const w = World
    .shape({
      oof: root(t),
      // wow: act()
    });

  type R = typeof w;
  type _ = R

  w.nodes

  return w.impl({

    async oof({and,ref},d) {
      ref //todo...
      return and.oof(d);
    }
    
    
    // async oof({and}, d) {
    //   return and.oof(d);
    // }
  });
}

const world =
  World
    .shape({
      pig: incl(animal('oink')),

      blub: incl(genericThing(Guard(123 as const))),
      // dog: incl(animal('woof')),

      meow: act(),

      speakToAnimals: act(Str),
    })
    .impl({
      async speakToAnimals({and,ref}, greeting) {
        return and.pig.hello(greeting);
      },

      // async blub(x, d) {
      //   return false;
      // }
    });


describe('worlds', () => {

  it('run through phases', async () => {
    const x = createRunner(world.build());
    
    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('bob', ['M_speakToAnimals', 'hullo!'])
    ]);

    expect(logs).toEqual([
      ['bob', ['*_boot']],
      ['bob', ['M_speakToAnimals', 'hullo!']],
      ['bob', ['M_pig_hello', 'hullo!']],
      ['bob', ['M_pig_responds']],
      ['bob', ['*_end', 'oink']],
    ]);
  })

  it('run through phases, after seal', async () => {
    const x = createRunner(world.seal().build());
    
    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('bob', ['M_speakToAnimals', 'hullo!'])
    ]);

    expect(logs).toEqual([
      ['bob', ['*_boot']],
      ['bob', ['M_speakToAnimals', 'hullo!']],
      ['bob', ['M_pig_hello', 'hullo!']],
      ['bob', ['M_pig_responds']],
      ['bob', ['*_end', 'oink']],
    ]);
  })
})


export default <T extends Narrowable>(t:T) =>
  World
    .shape({
      moo: act(t)
    })
    .impl({
      async moo({}, d) {
        d
        throw 123;
        // return and.moo(d);
      }
    });

//how can we be sure that ReadExpand is not never?
//if it is never, it should be unknown

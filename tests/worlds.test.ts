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


const Template = {
  shape<S>(s:S) {
    return Template;
  },

  args() {
    return Template;
  },

  impl<I>(i:I) {
    return Template;
  }
};


const vegetable = (tastes:string) =>
  Template
    .shape({
      sits: act()
    })
    .param({
      
    })
    .impl({
      async sits({and}) {
        return and.end(tastes);
      }
    });

const world = World
  .with(animal('oink').as('pig'))
  .with(animal('woof').as('dog'))
  .shape({
    speakToAnimals: act(),

    turnip: tmpl(vegetable('turnipy'))

    //the above is great, except...
    //how do we tell animal what to bind to?
    //it needs to make an appearance in the impl section also

    //the shape of a template is to be included up top
    //but its implementation must be parameterised in impl
    
  })
  .impl({
    async speakToAnimals({and}) {
      return and.pig.hello();
    },

    turnip: {
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

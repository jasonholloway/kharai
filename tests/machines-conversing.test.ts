import _Monoid from '../src/_Monoid'
import { parakeet } from './worlds/parakeet'
import { delay } from '../src/util';
import { createRunner, showData } from './shared';
import { World } from './shape/World';
import { act } from './shape/common';

describe('machines - conversing', () => {
  const world = parakeet.build();

  it('atom dependencies tracked', async () => {
    const x = createRunner(world, { save: false });

    await Promise.all([
      x.run.boot('Polly', ['listen']),
      x.run.boot('Priscilla', ['listen']),
      x.run.boot('Pete', ['chirp', [['Polly', 'Priscilla'], 'hello!']])
    ]);

    await delay(200)

    const polly = x.view('Polly');
    const priscilla = x.view('Priscilla');
    const pete = x.view('Pete');

    expect(showData(priscilla[0]))
      .toEqual({ Priscilla: ['listen'] })

    expect(showData(priscilla[1]))
      .toEqual({
        Polly: ['end', 'chirped!'],
        Priscilla: ['chirp', [[], 'hello!']]
      })

    expect(priscilla[1].parents())
      .toContainEqual(priscilla[0])

    expect(priscilla[1].parents())
      .toContainEqual(polly[1])

    expect(showData(priscilla[2]))
      .toEqual({
        Priscilla: ['end', 'no-one to chirp to!']
      })

    expect(priscilla[2].parents())
      .toContainEqual(priscilla[1])
  })

  xit('errors in peers mean \'false\'', async () => {
  })

  it('via rendesvous', async () => {
    const x = createRunner(world, { save: false });

    await x.session(async () => {
      await Promise.all([
        x.run.boot('skolmer', ['$m_place']),
        x.run.boot('a', ['migrate', 'skolmer']),
        x.run.boot('b', ['migrate', 'skolmer']),
        x.run.summon(['a', 'b']).then(s => s.log$.toPromise()),
      ]);

      const a = x.view('a');
      const b = x.view('b');

      expect(showData(a[3]))
        .toHaveProperty('a', ['end', {a:'hello', b:'hello'}])

      expect(showData(b[3]))
        .toHaveProperty('b', ['end', {a:'hello', b:'hello'}])
    });
  })

  it('meet from outside', async () => {
    const w = World
      .shape({
        gerbil: act()
      })
      .impl({
        async gerbil({attend}) {
          await attend(m => {
            return [`I heard ${m}`];
          });

          return false;
        }
      });

    const x = createRunner(w.build(), {save:false});

    //
    //a fresh context
    //with most bits not injected in via facs
    //
    //it's almost a mixin situtaion 
    //we have a tree of contexts and this sidegrowth
    //of a context without an address
    //though it will be able to convene and attend and watch
    //and everything else
    //and so - could we just use the root context?
    //or maybe a special sidebranch 
    //though as soon as we have an address we are addressable!
    //we're not addressable
    //
    //in fact, are we even attendable? possibly, yes
    //we could be waiting for emissions
    //and if so, we would need an address
    //but how could multiple things be reachable on the same address?
    //it actually sounds possible and doable and even desirable
    //
    //and so we'd have a special well-known address for outside 'runs'
    //$client or somesuch
    //which would have a fac, but no data
    //(so it would be addressable, but wouldn't have a state)
    //
    //wait a sec...
    //the special $client fac
    //is just the address of a fac
    //although as a mainstream fac, this would involve an 'id'
    //so it does still imply addressability
    //

    await x.run.space.runArbitrary(async x => {
      //ref isn't on root node apparently...
      //todo: ref needs to add to root please

      x

      const gary = await meet(ref.gerbil());
      gary.chat('squeak');
      //...
      
    });
  })

  it('meet from inside', async () => {
    const w = World
      .shape({
        rat: act(),
        gerbil: act()
      })
      .impl({
        async rat({meet,ref}) {
          const gary = await meet(ref.gerbil());

          gary.chat('squeak');

          return false;
        },

        async gerbil({attend}) {
          await attend(m => {
            return [`I heard ${m}`];
          });

          return false;
        }
      });

    const x = createRunner(w.build(), {save:false});

    await x.run.session(async () => {
      //...
    });
  })
})


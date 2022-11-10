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

    //problem: ref and other bits are created
    //as normal ctx additions in World.ts
    //and put in the fac tree
    //whereas they are really another layer
    //independent of machine, but shaped by the world

    //so we have another layer of context
    //to be mixed in up top
    //but - this context is already worked out for actual
    //machines 

    //the issue is, for this to be contextual, everything points towards it expecting bits like 'id'
    //it shouldn't be contextual for root context - it's a peculiar situation in fact

    //we want to use the context of '/'
    //but we have no id, and we don't want to see and options that rely on there being an addressable entity in play
    //it's like: contextual bits not relying on ids should be added generally
    //but, ref does rely on id, or rather on path - which is not the same thing in fact
    //
    //id could be omitted, and anything deriving from it?
    //though user-added bits would not be omitted
    //
    //do we then want a freshly-created context? yup. and this means sharing submethods as much as possible
    //if not the entire thing
    //

    // problem is, meet and ref are from the user tree
    // which is brought in, built up given a certain path
    // and in this arbitrary context we... have a path?
    // we certainly could have a path, though a fixed one
    // a path of $client or similar
    // which would give us all the normal refs etc
    //
    // some contextual bits _really_ do refer to the machine context though
    // 'id' might be salvagable, but 'isFresh()'???
    // a run context isnt a machine
    //
    // 
    // NEEDED: a $root path
    // effectively a hidden path in the tree
    // shape() always puts things under $machine
    // then there'd be an effectively hidden $client path
    // root would be nicely shared

    await x.run.space.runArbitrary(async ({meet,ref}) => {
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


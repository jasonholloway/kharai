import { describe, expect, it, xit } from '@jest/globals';
import _Monoid from '../src/_Monoid'
import { parakeet } from './worlds/parakeet'
import { run, showData } from './shared';
import { World } from '../src/shape/World';
import { act, root } from '../src/shape/common';
import { delay } from 'rxjs/operators';

describe('machines - conversing', () => {
  const world = parakeet.build();

  it('atom dependencies tracked', () =>
    run(world, { save: false })
      .perform(({and,boot}) => boot('Polly', and.listen()))
      .perform(({and,boot}) => boot('Priscilla', and.listen()))
      .perform(({and,boot}) => boot('Pete', and.chirp([['Polly','Priscilla'], 'hello!'])))
      .waitQuiet()
      .then(({view}) => {
        const polly = view('Polly').atoms;
        const priscilla = view('Priscilla').atoms;
        const pete = view('Pete').atoms;

        expect(showData(priscilla[0]))
          .toEqual({ Priscilla: ['M_listen'] })

        expect(showData(priscilla[1]))
          .toEqual({
            Polly: ['*_end', 'chirped!'],
            Priscilla: ['M_chirp', [[], 'hello!']]
          })

        expect(priscilla[1].parents())
          .toContainEqual(priscilla[0])

        expect(priscilla[1].parents())
          .toContainEqual(polly[1])

        expect(showData(priscilla[2]))
          .toEqual({
            Priscilla: ['*_end', 'no-one to chirp to!']
          })

        expect(priscilla[2].parents())
          .toContainEqual(priscilla[1])
      }))

  xit('errors in peers mean \'false\'', async () => {
  })

  it('via rendesvous', () =>
    run(world, { save: false })
      .perform(({boot,and}) => boot('skolmer', and.$m.place()))
      .perform(({boot,and}) => boot('a', and.migrate('skolmer')))
      .perform(({boot,and}) => boot('b', and.migrate('skolmer')))
      .waitQuiet()
      .then(({view}) => {
        //need some way of waiting till the right time...
        const a = view('a').atoms;
        const b = view('b').atoms;

        expect(showData(a[3]))
          .toHaveProperty('a', ['*_end', {a:'hello', b:'hello'}])

        expect(showData(b[3]))
          .toHaveProperty('b', ['*_end', {a:'hello', b:'hello'}])
      })
  )

  it('can cancel convene', () =>
    run(world, { save: false })
      .perform(({boot,and}) => boot('babs', and.flapAbout()))
      .perform(async x => {
        const convening = x.convene(['babs'], ps => {
          throw 'SHOULD NEVER HAPPEN!!!';
        });

        await delay(50);
        await convening.cancel();
      })
      .waitQuiet()
  )

  xit('meet from outside', () =>
    run(World
      .shape({
        gerbil: root(true)
      })
      .impl({
        async gerbil({attend}) {
          await attend(m => {
            return [`I heard ${m}`];
          });

          return false;
        }
      }).build(),
        {save:false}
       )
      .perform(async ({meet,ref}) => {
        const gary = await meet(ref.gerbil(true));
        gary.chat('squeak');
        //todo...
      })
      .waitQuiet()
    );

  xit('meet from inside', () => {
    const w = World
      .shape({
        rat: act(),
        gerbil: root(true)
      })
      .impl({
        async rat({meet,ref}) {
          const gary = await meet(ref.gerbil(true));
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

    return run(w.build(), {save:false})
      .perform(async () => {
        //todo...
      })
      .waitQuiet();
  })
})


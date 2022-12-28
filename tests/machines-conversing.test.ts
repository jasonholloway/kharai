import _Monoid from '../src/_Monoid'
import { parakeet } from './worlds/parakeet'
import { run, showData } from './shared';
import { World } from '../src/shape/World';
import { act, root } from '../src/shape/common';
import { delay } from '../src/util';

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
      }))

  it('meet from outside', () =>
    run(World
      .shape({
        gerbil: root(true)
      })
      .impl({
        async gerbil({and,attend}) {
					const ms: unknown[] = [];
					
          await attend(m => {
						ms.push(`Received ${m}`);
            return [,`Answered ${m}`];
          });

          return and.end(ms);
        }
      }).build(),
        {save:false}
       )
      .perform(async ({meet,ref}) => {
        const g = await meet(ref.gerbil(true));
        return g.chat('squeak');
      })
      .waitQuiet()
		  .then(({view,result}) => {
				expect(result).toEqual([['Answered squeak']]);
				expect(view('@M_gerbil,true').logs)
					.toEqual([
						['M_gerbil', 'true'],
						['*_end', ['Received squeak']]
					]);
			})
    );

  it('meet from inside', async () => {
    const w = World
      .shape({
        rat: root(true),
        gerbil: root(true)
      })
      .impl({
        async rat({meet,ref,and}) {
          const g = await meet(ref.gerbil(true));

          //chat now has to be async surely
          const resp1 = g.chat('squeak');
          const resp2 = g.chat('nip');

          //TODO as peer can always cancel
          //must return wraped type with possibility of 'no!'
          //a Conversation<V> type needed?

          return and.end([resp1,resp2]);
        },

        //how can an attendee chat?
        //best would be an inverted receive
        //first meets with a message
        //const [gerb,resp] = summon.gerbil(true).greet('hello')
        //const [gerb,resp] = meet(ref.gerbil(true)).greet('hello')

        async gerbil({and,attend}) {
          const ms: unknown[] = [];
          
          await attend(m => {
            ms.push(`Received ${m}`);
            return [,`Answered ${m}`];
          });

          return and.end(ms);
        }
      });

    await run(w.build(), {save:false})
      .perform(({summon,ref}) => summon(ref.rat(true)))
      .waitQuiet()
      .then(({view}) => {
        expect(view('@M_rat,true').logs[1])
          .toEqual(['*_end', [['Answered squeak'], ['Answered nip']]]);

        expect(view('@M_gerbil,true').logs[1])
          .toEqual(['*_end', ['Received squeak', 'Received nip']]);
      });

    //TODO returning false doesn't save properly
    //test this
  })

  it('meet from inside, with peer returning false, doesnt commit', async () => {
    const w = World
      .shape({
        rat: root(true),
        gerbil: root(true)
      })
      .impl({
        async rat({meet,ref,and}) {
          const gerry = await meet(ref.gerbil(true));
          const resp1 = gerry.chat('squeak');
          const resp2 = gerry.chat('nip');
          return and.end([resp1,resp2]);
        },

        async gerbil({attend}) {
          await attend(m => {
            return [,`Answered ${m}`];
          });

          return false;
        }
      });

    await run(w.build(), {save:false})
      .perform(({summon,ref}) => summon(ref.rat(true)))
      .waitQuiet()
      .then(({view}) => {
        expect(view('@M_rat,true').logs)
          .toEqual([['M_rat', 'true']]);

        expect(view('@M_gerbil,true').logs)
          .toEqual([['M_gerbil', 'true']]);
      });
  })
})


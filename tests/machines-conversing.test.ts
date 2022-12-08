import _Monoid from '../src/_Monoid'
import { parakeet } from './worlds/parakeet'
import { delay } from '../src/util';
import { createRunner, showData } from './shared';
import { World } from '../src/shape/World';
import { act, root } from '../src/shape/common';

describe('machines - conversing', () => {
  const world = parakeet.build();

  it('atom dependencies tracked', async () => {
    const x = createRunner(world, { save: false });

    await Promise.all([
      x.run.boot('Polly', ['M_listen']),
      x.run.boot('Priscilla', ['M_listen']),
      x.run.boot('Pete', ['M_chirp', [['Polly', 'Priscilla'], 'hello!']])
    ]);

    await delay(200)

    const polly = x.view('Polly');
    const priscilla = x.view('Priscilla');
    const pete = x.view('Pete');

    expect(showData(priscilla[0]))
      .toEqual({ Priscilla: ['M_listen'] })

    expect(showData(priscilla[1]))
      .toEqual({
        Polly: ['M_*end', 'chirped!'],
        Priscilla: ['M_chirp', [[], 'hello!']]
      })

    expect(priscilla[1].parents())
      .toContainEqual(priscilla[0])

    expect(priscilla[1].parents())
      .toContainEqual(polly[1])

    expect(showData(priscilla[2]))
      .toEqual({
        Priscilla: ['M_*end', 'no-one to chirp to!']
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
        x.run.boot('skolmer', ['M_$m_place']),
        x.run.boot('a', ['M_migrate', 'skolmer']),
        x.run.boot('b', ['M_migrate', 'skolmer']),
        x.run.summon(['a', 'b']).then(s => s.log$.toPromise()),
      ]);

      const a = x.view('a');
      const b = x.view('b');

      expect(showData(a[3]))
        .toHaveProperty('a', ['M_*end', {a:'hello', b:'hello'}])

      expect(showData(b[3]))
        .toHaveProperty('b', ['M_*end', {a:'hello', b:'hello'}])
    });
  })

  it('meet from outside', async () => {
    const w = World
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
      });

    const x = createRunner(w.build(), {save:false});

    await x.run.space.runArbitrary(async ({meet,ref}) => {
      const gary = await meet(ref.gerbil(true));
      gary.chat('squeak');
      //...
      
    });
  })

  it('meet from inside', async () => {
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

    const x = createRunner(w.build(), {save:false});

    await x.run.session(async () => {
      //...
    });
  })
})


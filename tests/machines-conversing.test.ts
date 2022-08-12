import _Monoid from '../src/_Monoid'
import { parakeet } from './worlds/parakeet'
import { delay } from '../src/util';
import { createRunner } from './shared';
import { inspect } from 'util';

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

    expect(priscilla[0].val().toObject())
      .toEqual({ Priscilla: ['listen'] })

    expect(priscilla[1].val().toObject())
      .toEqual({
        Polly: ['$end', 'chirped!'],
        Priscilla: ['chirp', [[], 'hello!']]
      })

    expect(priscilla[1].parents())
      .toContainEqual(priscilla[0])

    expect(priscilla[1].parents())
      .toContainEqual(polly[1])

    expect(priscilla[2].val().toObject())
      .toEqual({
        Priscilla: ['$end', 'no-one to chirp to!']
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

      expect(a[3].val().get('a'))
        .toEqual(['$end', {a:'hello', b:'hello'}])

      expect(b[3].val().get('b'))
        .toEqual(['$end', {a:'hello', b:'hello'}])
    });
  })
})


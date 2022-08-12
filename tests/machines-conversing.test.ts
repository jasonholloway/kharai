import _Monoid from '../src/_Monoid'
import { parakeet } from './worlds/parakeet'
import { delay } from '../src/util';
import { createRunner } from './shared';

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

    const [,,,logs] = await Promise.all([
      x.run.boot('skolmer', ['$m_place']),
      x.run.boot('a', ['migrate', 'skolmer']),
      x.run.boot('b', ['migrate', 'skolmer']),
      x.allLogs()
    ]);


    //what do we want to test here??
    //that all the machines have got to a reasonable place, having conversed via a mediator
    //simplest result would be: each contributes to a map
    //which would be via noddy mediation
    //each recipient 


    //meeting context, or indeed the simple string key
    //should be appended on the end as a final value

    

    //TODO: need way of nicely typing the callback state
    //the callback state also needs to promise to immediately attend
    //when it attends, it will be in meeting with its peers, under a common convener
  })
})


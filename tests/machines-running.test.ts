import _Monoid from '../src/_Monoid'
import { createRunner } from './shared'
import { rodents } from './worlds/rodents'

describe('machines - running', () => {
  const world = rodents.build();

  it('run through phases', async () => {
    const x = createRunner(world);
    
    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('bob', ['rat', ['wake', []]])
    ]);

    expect(logs).toEqual([
      ['bob', ['$boot', []]],
      ['bob', ['rat', ['wake', []]]],
      ['bob', ['rat', ['squeak', [123]]]],
      ['bob', ['$end', ['I have squeaked 123!']]]
    ]);
  })

  it('two run at once', async () => {
    const x = createRunner(world);

    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('nib', ['hamster', ['wake', [77]]]),
      x.run.boot('bob', ['rat', ['wake', []]])
    ]);

    expect(logs).toEqual([
      ['nib', ['$boot', []]],
      ['bob', ['$boot', []]],
      ['nib', ['hamster', ['wake', [77]]]],
      ['bob', ['rat', ['wake', []]]],
      ['bob', ['rat', ['squeak', [123]]]],
      ['bob', ['$end', ['I have squeaked 123!']]],
      ['nib', ['$end', [77]]],
    ])
  })

  it('two talk to one another', async () => {
    const x = createRunner(world);

    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('gaz', ['guineaPig', ['runAbout', []]]),
      x.run.boot('goz', ['guineaPig', ['gruntAt', ['gaz']]])
    ]);

    expect(logs).toEqual([
      ['gaz', ['$boot', []]],
      ['goz', ['$boot', []]],
      ['gaz', ['guineaPig', ['runAbout', []]]],
      ['goz', ['guineaPig', ['gruntAt', ['gaz']]]],
      ['goz', ['$end', ['squeak!']]],
      ['gaz', ['$end', ['grunt!']]],
    ])
  })
})

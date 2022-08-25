import _Monoid from '../src/_Monoid'
import { createRunner } from './shared'
import { rodents } from './worlds/rodents'

describe('machines - running', () => {
  const world = rodents.build();

  it('run through phases', async () => {
    const x = createRunner(world);
    
    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('bob', ['rat_wake'])
    ]);

    expect(logs).toEqual([
      ['bob', ['boot']],
      ['bob', ['rat_wake']],
      ['bob', ['rat_squeak', 123]],
      ['bob', ['end', 'I have squeaked 123!']]
    ]);
  })

  it('two run at once', async () => {
    const x = createRunner(world);

    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('nib', ['hamster_wake', 77]),
      x.run.boot('bob', ['rat_wake'])
    ]);

    expect(logs).toEqual([
      ['nib', ['boot']],
      ['bob', ['boot']],
      ['nib', ['hamster_wake', 77]],
      ['bob', ['rat_wake']],
      ['bob', ['rat_squeak', 123]],
      ['bob', ['end', 'I have squeaked 123!']],
      ['nib', ['end', 77]],
    ])
  })

  it('two talk to one another', async () => {
    const x = createRunner(world);

    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('gaz', ['guineaPig_runAbout']),
      x.run.boot('goz', ['guineaPig_gruntAt', 'gaz'])
    ]);

    expect(logs).toEqual([
      ['gaz', ['boot']],
      ['goz', ['boot']],
      ['gaz', ['guineaPig_runAbout']],
      ['goz', ['guineaPig_gruntAt', 'gaz']],
      ['goz', ['end', 'squeak!']],
      ['gaz', ['end', 'grunt!']],
    ])
  })

  it('one proceeds through brief wait', async () => {
    const x = createRunner(world);

    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('taz', ['wait', [1000, ['end', 123]]]),
    ]);

    expect(logs).toEqual([
      ['taz', ['boot']],
      ['taz', ['wait', [1000, ['end', 123]]]],
      ['taz', ['end', 123]],
    ])
  })

  it('refuses to boot into stange phase', async () => {
    const x = createRunner(world);

    const summoned = await x.run.summon(['nibbles']);
    const r = await summoned.tell(['someRubbish']).promise();

    expect(r).toBeFalsy();
  })

  it('has access to untyped transient per-run per-machine data', async () => {
    const x = createRunner(world);

    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('caz', ['capybara_nip', 0])
    ]);

    expect(logs).toEqual([
      ['caz', ['boot']],
      ['caz', ['capybara_nip', 0]],
      ['caz', ['capybara_nip', 0]],
      ['caz', ['capybara_nip', 1]],
      ['caz', ['capybara_nip', 2]],
      ['caz', ['capybara_nip', 3]],
      ['caz', ['end', 'yip']]
    ]);
  })

})

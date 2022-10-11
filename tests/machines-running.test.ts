import _Monoid from '../src/_Monoid'
import { createRunner } from './shared'
import { rodents } from './worlds/rodents'
import { Map } from 'immutable'
import { World } from '../src/shape/World'
import { act } from '../src/shape/common'
import { Num } from '../src/guards/Guard'

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

  //below doesn't actually hold!
  xit('refuses to boot into stange phase', async () => {
    const x = createRunner(world);

    const summoned = await x.run.summon(['nibbles']);
    const r = await summoned.tell(['someRubbish']);

    await x.log$.toPromise();

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


  it('isFresh when first loaded', async () => {
		const x = createRunner(world, {
			data: Map({
				saz: ['shrew', [0, false]]
			})
		});

    const [logs1] = await Promise.all([
      x.allLogs(),
      x.run.summon(['saz'])
    ]);

    expect(logs1).toEqual([
      ['saz', ['shrew', [0, false]]],
      ['saz', ['shrew', [1, true]]], //sure sign that previous phase was 'fresh'
      ['saz', ['shrew', [2, false]]],
      ['saz', ['end', 'yip']]
    ]);
  })

  it('isFresh false when boot is first (but why?!)', async () => {
    const x = createRunner(world);

    const [logs1] = await Promise.all([
      x.allLogs(),
      x.run.boot('saz', ['shrew', [0, false]])
    ]);

    expect(logs1).toEqual([
      ['saz', ['boot']],
      ['saz', ['shrew', [0, false]]],
      ['saz', ['shrew', [1, false]]],
      ['saz', ['shrew', [2, false]]],
      ['saz', ['end', 'yip']]
    ]);
  })

  describe('skipping adds no weight', () => {
    it('simple single commits', async () => {
      const w = World
        .shape({
          ghost: act(Num)
        })
        .impl({
          async ghost({and,attend}) {
            const r = await attend(m => {
              if(m) {
                return [and.skip()]
              }
              else {
                return [and.end('fin')];
              }
            });

            return r && r[0];
          }
        });
      
      const x = createRunner(w.build(), { threshold: 1 });

      const [logs] = await Promise.all([
        x.allLogs(),
        x.run.boot('G', ['ghost', 3]),

        (async () => {
          const g0 = await x.run.summon(['G'])
          await g0.tell(true);

          const g1 = await x.run.summon(['G'])
          await g1.tell(true);

          const g2 = await x.run.summon(['G'])
          await g2.tell(false);
        })()
      ]);

      expect(logs).toEqual([
        ['G', ['boot']],
        ['G', ['ghost', 3]],
        ['G', ['ghost', 3]],
        ['G', ['ghost', 3]],
        ['G', ['end', 'fin']]
      ]);

      expect(x.store.batches).toEqual([
        Map([['G', ['ghost', 3]]]),
        Map([['G', ['end', 'fin']]])
      ]);
    })
  })

  describe('root-level ctxs', () => {
    it('simple', async () => {
      const w = World
        .shape({
          hello: act()
        })
        .ctx(x => ({
          cow: 'moo!' as const,
        }))
        .impl({
          async hello({and,cow}) {
            return and.end(cow);
          }
        });

      const x = createRunner(w.build());

      const [logs] = await Promise.all([
        x.allLogs(),
        x.run.boot('A', ['hello'])
      ]);

      expect(logs).toEqual([
        ['A', ['boot']],
        ['A', ['hello']],
        ['A', ['end', 'moo!']]
      ]);
    })

    it('chained', async () => {
      const w = World
        .shape({
          hello: act()
        })
        .ctx(x => ({
          cow: 'moo!' as const,
        }))
        .ctx(x => ({
          farmyardSounds: [x.cow]
        }))
        .impl({
          async hello({and,farmyardSounds}) {
            return and.end(farmyardSounds);
          }
        });

      const x = createRunner(w.build());

      const [logs] = await Promise.all([
        x.allLogs(),
        x.run.boot('A', ['hello'])
      ]);

      expect(logs).toEqual([
        ['A', ['boot']],
        ['A', ['hello']],
        ['A', ['end', ['moo!']]]
      ]);
    })

    it('using core ctx', async () => {
      const w = World
        .shape({
          hello: act()
        })
        .ctx(x => ({
          cow: `moo ${x.id}!` as const,
        }))
        .impl({
          async hello({and,cow}) {
            return and.end(cow);
          }
        });

      const x = createRunner(w.build());

      const [logs] = await Promise.all([
        x.allLogs(),
        x.run.boot('A', ['hello'])
      ]);

      expect(logs).toEqual([
        ['A', ['boot']],
        ['A', ['hello']],
        ['A', ['end', 'moo A!']]
      ]);
    })
  })


  //todo
  //modules should be sealable, 
  //ie readied for export, by stripping types inaccessible from outside
})

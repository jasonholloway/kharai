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
      x.run.boot('bob', ['M_rat_wake', ''])
    ]);

    expect(logs).toEqual([
      ['bob', ['*_boot']],
      ['bob', ['M_rat_wake', '']],
      ['bob', ['M_rat_squeak', 123]],
      ['bob', ['*_end', 'I have squeaked 123!']]
    ]);
  })

  it('two run at once', async () => {
    const x = createRunner(world);

    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('nib', ['M_hamster_wake', 77]),
      x.run.boot('bob', ['M_rat_wake', ''])
    ]);

    expect(logs).toEqual([
      ['nib', ['*_boot']],
      ['bob', ['*_boot']],
      ['nib', ['M_hamster_wake', 77]],
      ['bob', ['M_rat_wake']],
      ['bob', ['M_rat_squeak', 123]],
      ['bob', ['*_end', 'I have squeaked 123!']],
      ['nib', ['*_end', 77]],
    ])
  })

  it('two talk to one another', async () => {
    const x = createRunner(world);

    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('gaz', ['M_guineaPig_runAbout']),
      x.run.boot('goz', ['M_guineaPig_gruntAt', 'gaz'])
    ]);

    expect(logs).toEqual([
      ['gaz', ['*_boot']],
      ['goz', ['*_boot']],
      ['gaz', ['M_guineaPig_runAbout']],
      ['goz', ['M_guineaPig_gruntAt', 'gaz']],
      ['goz', ['*_end', 'squeak!']],
      ['gaz', ['*_end', 'grunt!']],
    ])
  })

  it('one proceeds through brief wait', async () => {
    const x = createRunner(world);

    const [logs] = await Promise.all([
      x.allLogs(),
      x.run.boot('taz', ['M_*wait', [1000, ['M_*end', 123]]]),
    ]);

    expect(logs).toEqual([
      ['taz', ['*_boot']],
      ['taz', ['*_wait', [1000, ['*_end', 123]]]],
      ['taz', ['*_end', 123]],
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
      x.run.boot('caz', ['M_capybara_nip', 0])
    ]);

    expect(logs).toEqual([
      ['caz', ['*_boot']],
      ['caz', ['M_capybara_nip', 0]],
      ['caz', ['M_capybara_nip', 0]],
      ['caz', ['M_capybara_nip', 1]],
      ['caz', ['M_capybara_nip', 2]],
      ['caz', ['M_capybara_nip', 3]],
      ['caz', ['*_end', 'yip']]
    ]);
  })


  it('isFresh when first loaded', async () => {
		const x = createRunner(world, {
			data: Map({
				saz: ['M_shrew', [0, false]]
			})
		});

    const [logs1] = await Promise.all([
      x.allLogs(),
      x.run.summon(['saz'])
    ]);

    expect(logs1).toEqual([
      ['saz', ['M_shrew', [0, false]]],
      ['saz', ['M_shrew', [1, true]]], //sure sign that previous phase was 'fresh'
      ['saz', ['M_shrew', [2, false]]],
      ['saz', ['*_end', 'yip']]
    ]);
  })

  it('isFresh false when boot is first (but why?!)', async () => {
    const x = createRunner(world);

    const [logs1] = await Promise.all([
      x.allLogs(),
      x.run.boot('saz', ['M_shrew', [0, false]])
    ]);

    expect(logs1).toEqual([
      ['saz', ['*_boot']],
      ['saz', ['M_shrew', [0, false]]],
      ['saz', ['M_shrew', [1, false]]],
      ['saz', ['M_shrew', [2, false]]],
      ['saz', ['*_end', 'yip']]
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
        x.run.boot('G', ['M_ghost', 3]),

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
        ['G', ['*_boot']],
        ['G', ['M_ghost', 3]],
        ['G', ['M_ghost', 3]],
        ['G', ['M_ghost', 3]],
        ['G', ['*_end', 'fin']]
      ]);

      expect(x.store.batches).toEqual([
        Map([['G', ['M_ghost', 3]]]),
        Map([['G', ['*_end', 'fin']]])
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
        x.run.boot('A', ['M_hello'])
      ]);

      expect(logs).toEqual([
        ['A', ['*_boot']],
        ['A', ['M_hello']],
        ['A', ['*_end', 'moo!']]
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
        x.run.boot('A', ['M_hello'])
      ]);

      expect(logs).toEqual([
        ['A', ['*_boot']],
        ['A', ['M_hello']],
        ['A', ['*_end', ['moo!']]]
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
        x.run.boot('A', ['M_hello'])
      ]);

      expect(logs).toEqual([
        ['A', ['*_boot']],
        ['A', ['M_hello']],
        ['A', ['*_end', 'moo A!']]
      ]);
    })
  })


  //todo
  //modules should be sealable, 
  //ie readied for export, by stripping types inaccessible from outside
})

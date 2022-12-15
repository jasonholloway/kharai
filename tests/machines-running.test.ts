import _Monoid from '../src/_Monoid'
import { run } from './shared'
import { rodents } from './worlds/rodents'
import { Map } from 'immutable'
import { World } from '../src/shape/World'
import { act } from '../src/shape/common'
import { Num } from '../src/guards/Guard'

describe('machines - running', () => {
  const world = rodents.build();

  it('run through phases', () =>
    run(world)
      .perform(async ({and,boot}) => {
        await boot('bob', and.rat.wake(''));
      })
      .then(s => {
        expect(s.logs).toEqual([
          ['bob', ['*_boot']],
          ['bob', ['M_rat_wake', '']],
          ['bob', ['M_rat_squeak', 123]],
          ['bob', ['*_end', 'I have squeaked 123!']]
        ]);
      })
    )

  it('two run at once', () =>
    run(world)
      .perform(({and,boot}) => Promise.all([
        boot('nib', and.hamster.wake(77)),
        boot('bob', and.rat.wake(''))
      ]))
      .then(s => {
        expect(s.logs).toEqual([
          ['nib', ['*_boot']],
          ['bob', ['*_boot']],
          ['nib', ['M_hamster_wake', 77]],
          ['bob', ['M_rat_wake']],
          ['bob', ['M_rat_squeak', 123]],
          ['bob', ['*_end', 'I have squeaked 123!']],
          ['nib', ['*_end', 77]],
        ])
      })
    )

  it('two talk to one another', () =>
    run(world)
      .perform(({and,boot}) => Promise.all([
        boot('gaz', and.guineaPig.runAbout()),
        boot('goz', and.guineaPig.gruntAt('gaz'))
      ]))
      .then(s => {
        expect(s.logs).toEqual([
          ['gaz', ['*_boot']],
          ['goz', ['*_boot']],
          ['gaz', ['M_guineaPig_runAbout']],
          ['goz', ['M_guineaPig_gruntAt', 'gaz']],
          ['goz', ['*_end', 'squeak!']],
          ['gaz', ['*_end', 'grunt!']],
        ])
      })
    )

  it('one proceeds through brief wait', () =>
    run(world)
      .perform(({and,boot}) =>
        boot('taz', and.wait([1000, and.end(123)]))
      )
      .then(s => {
        expect(s.logs).toEqual([
          ['taz', ['*_boot']],
          ['taz', ['*_wait', [1000, ['*_end', 123]]]],
          ['taz', ['*_end', 123]],
        ])
      })
    )

  //below doesn't actually hold!
  // xit('refuses to boot into stange phase', async () => {
  //   const x = testRun(world);

  //   const summoned = await x.run.summon(['nibbles']);
  //   const r = await summoned.tell(['someRubbish']);

  //   await x.log$.toPromise();

  //   expect(r).toBeFalsy();
  // })

  it('has access to untyped transient per-run per-machine data', () =>
    run(world)
      .perform(({and,boot}) =>
        boot('caz', and.capybara.nip(0))
      )
      .then(s => {
        expect(s.logs).toEqual([
          ['caz', ['*_boot']],
          ['caz', ['M_capybara_nip', 0]],
          ['caz', ['M_capybara_nip', 0]],
          ['caz', ['M_capybara_nip', 1]],
          ['caz', ['M_capybara_nip', 2]],
          ['caz', ['M_capybara_nip', 3]],
          ['caz', ['*_end', 'yip']]
        ]);
      })
    )

  it('isFresh when first loaded', () =>
    run(world,
      {
        data: Map({
          saz: ['M_shrew', [0, false]]
        })
      })
      .perform(({summon}) => summon(['saz'])
      )
      .then(s => {
        expect(s.logs).toEqual([
          ['saz', ['M_shrew', [0, false]]],
          ['saz', ['M_shrew', [1, true]]], //sure sign that previous phase was 'fresh'
          ['saz', ['M_shrew', [2, false]]],
          ['saz', ['*_end', 'yip']]
        ]);
      })
    )

  it('isFresh false when boot is first (but why?!)', () =>
    run(world)
      .perform(({and,boot}) =>
        boot('saz', and.shrew([0, false])))
      .then(s => {
        expect(s.logs).toEqual([
          ['saz', ['*_boot']],
          ['saz', ['M_shrew', [0, false]]],
          ['saz', ['M_shrew', [1, false]]],
          ['saz', ['M_shrew', [2, false]]],
          ['saz', ['*_end', 'yip']]
        ]);
      })
    )

  describe('skipping adds no weight', () => {
    it('simple single commits', () =>
      run(World
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
        }).build(),
        { threshold: 1 }
      )
      .perform(({and,boot,summon}) => Promise.all([
        boot('G', and.ghost(3)),
        (async () => {
          const g0 = await summon(['G'])
          await g0.tell(true);

          const g1 = await summon(['G'])
          await g1.tell(true);

          const g2 = await summon(['G'])
          await g2.tell(false);
        })()
      ]))
      .then(s => {
        expect(s.logs).toEqual([
          ['G', ['*_boot']],
          ['G', ['M_ghost', 3]],
          ['G', ['M_ghost', 3]],
          ['G', ['M_ghost', 3]],
          ['G', ['*_end', 'fin']]
        ]);

        expect(s.batches).toEqual([
          Map([['G', ['M_ghost', 3]]]),
          Map([['G', ['*_end', 'fin']]])
        ]);
      })
    )

  describe('root-level ctxs', () => {
    it('simple', () => {
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

      return run(w.build())
        .perform(({boot,and}) => boot('A', and.hello()))
        .then(s => {
          expect(s.logs).toEqual([
            ['A', ['*_boot']],
            ['A', ['M_hello']],
            ['A', ['*_end', 'moo!']]
          ]);
        })
    })

    it('chained', () => {
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

      return run(w.build())
        .perform(({boot,and}) => boot('A', and.hello()))
        .then(s => {
          expect(s.logs).toEqual([
            ['A', ['*_boot']],
            ['A', ['M_hello']],
            ['A', ['*_end', ['moo!']]]
          ]);
        });
    })

    it('using core ctx', () => {
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

      return run(w.build())
        .perform(({boot,and}) =>
          boot('A', and.hello()))
        .then(s => {
          expect(s.logs).toEqual([
            ['A', ['*_boot']],
            ['A', ['M_hello']],
            ['A', ['*_end', 'moo A!']]
          ]);
        });
      })
    })


  //todo
  //modules should be sealable, 
  //ie readied for export, by stripping types inaccessible from outside
  })
})

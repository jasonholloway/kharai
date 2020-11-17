import _Monoid from '../../src/_Monoid'
import { Id, SpecWorld, makeWorld, World, Phase } from '../../src/lib'
import { delay } from '../../src/util'
import { bootPhase, endPhase, waitPhase } from '../shared'

export type TRodents<Me extends World = World> = SpecWorld<{
  $boot: []
  $end: [any]
  $wait: [number, Phase<Me>]

  rat: {
    wake: [],
    squeak: [number]
  }

  hamster: {
    wake: [number]
    nibble: []
  }

  guineaPig: {
    runAbout: []
    gruntAt: [Id]
  }

  gerbil: {
    spawn: [number[], number]
  }
}>

export type Rodents = TRodents<TRodents>

export function rodents() {
  return makeWorld<TRodents<TRodents>>()({
    contextFac: x => x,
    phases: {
      $boot: bootPhase(),
      $end: endPhase(),
      $wait: waitPhase(),

      rat: {
        wake: x => ({
          guard(d): d is [] { return true },
          async run() {
            return ['squeak', [123]]
          }
        }),

        squeak: x => ({
          guard(d): d is [number] { return true },
          async run([d]) {
            return ['$end', [`I have squeaked ${d}!`]]
          }
        })
      },

      hamster: {
        wake: x => ({
          guard(d): d is [number] { return true },
          async run([d]) {
            await delay(100);
            return ['$end', [d]]
          }
        }),
        nibble: x => ({
          guard(d): d is [] { return true },
          async run() {
            return false;
          }
        })
      },

      guineaPig: {
        runAbout: x => ({
          guard(d): d is [] { return true },
          async run() {
            const a = await x.attach({ chat(m) { return [m, 'squeak!'] } });
            return (a && ['$end', a]) || ['$end', ['BIG NASTY ERROR']]
          }
        }),

        gruntAt: x => ({
          guard(d): d is [Id] { return true },
          async run([id]) {
            const resp = await x.convene([id], {
              convene([p]) {
                const a = p.chat('grunt!');
                if(a) return a;
                else throw Error('bad response from attendee')
              }
            });

            return ['$end', resp]
          }
        })
      },

      gerbil: {
        spawn: x => ({
          guard(d): d is [number[], number] { return true; },
          async run([path, i]) {
            console.log(path, i, Date.now())

            if(path.length < 3 && i < 3) {
              //spawn
              const path2 = [...path, i];

              await x.convene([`${x.id}${i}`], {
                convene([p]) {
                  p.chat([['gerbil', ['spawn', [path2, 0]]]])
                }
              })

              return ['spawn', [path, i + 1]]
            }

            return false;
          }
        })
      }
    }
  })
}

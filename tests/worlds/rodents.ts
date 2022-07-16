import _Monoid from '../../src/_Monoid'
import { delay } from '../../src/util'
import { Any, Many, Num, Str } from '../../src/guards/Guard'
import { $root, act } from '../../src/shapeShared';
import { World } from '../../src/shape/World';

export const rodents = World
  .shape({
    $boot: act([]),
    $end: act(Many(Any)),
    $wait: act([Num, $root] as const),

    rat: {
      wake: act([]),
      squeak: act([Num] as const)
    },

    hamster: {
      wake: act([Num] as const),
      nibble: act([])
    },

    guineaPig: {
      runAbout: act([]),
      gruntAt: act([Str] as const)
    },

    gerbil: {
      spawn: act([Num, Num] as const)
    }
  })
  .impl({
    rat: {
      async wake(_, [n]) {
        return ['rat_squeak', [123]];
      },

      async squeak(_, [d]) {
        return ['$end', ['I have squeaked ${d}!']]
      }
    },

    hamster: {
      async wake(_, d) {
        await delay(100);
        return ['$end', [d]];
      },

      async nibble() {
        return ['$end', []];
      }
    },

    guineaPig: {
      async runAbout(x) {
        const a = await x.attach({ chat(m) { return [m, 'squeak!'] } });
        return (a && ['$end', a]) || ['$end', ['BIG NASTY ERROR']]
      },

      async gruntAt(x, [id]) {
        const resp = await x.convene([id], {
          convene([p]) {
            const a = p.chat('grunt!');
            if(a) return a;
            else throw Error('bad response from attendee')
          }
        });
        return ['$end', resp]
      }
    },

    gerbil: {
      async spawn(x, [step, max]) {
        if(step < max) {
          const appendage = String.fromCharCode('a'.charCodeAt(0) + step);

          if(x.id.length < max) {
            const other = `${x.id}${appendage}`;

            await x.convene([other], {
              convene([p]) {
                p.chat([['gerbil', ['spawn', [0, max]]]])
              }
            })

            return ['gerbil_spawn', [step + 1, max]]
          }
        }

        return false;
      }
    }
  });

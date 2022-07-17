import _Monoid from '../../src/_Monoid'
import { delay } from '../../src/util'
import { Num, Str } from '../../src/guards/Guard'
import { act } from '../../src/shape/common';
import { World } from '../../src/shape/World';
import { $root } from '../../src/shapeShared';

export const rodents = World
  .shape({
    $wait: act([Num, $root] as const),

    rat: {
      wake: act(),
      squeak: act(Num)
    },

    hamster: {
      wake: act(Num),
      nibble: act()
    },

    guineaPig: {
      runAbout: act(),
      gruntAt: act(Str)
    },

    gerbil: {
      spawn: act([Num, Num] as const)
    }
  })
  .impl({
    rat: {
      async wake() {
        return ['rat_squeak', 123];
      },

      async squeak(_, d) {
        return ['$end', `I have squeaked ${d}!`]
      }
    },

    hamster: {
      async wake(_, d) {
        await delay(100);
        return ['$end', d];
      },

      async nibble() {
        return ['$end', 'done'];
      }
    },

    guineaPig: {
      async runAbout(x) {
        const a = await x.attend({ chat(m) { return [m, 'squeak!'] } });
        return (a && ['$end', a[0]]) || ['$end', 'BIG NASTY ERROR']
      },

      async gruntAt(x, id) {
        const resp = await x.convene([id], {
          convene([p]) {
            const a = p.chat('grunt!');
            if(a) return a;
            else throw Error('bad response from attendee')
          }
        });
        return ['$end', resp[0]]
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
                p.chat(['gerbil_spawn', [0, max]])
              }
            })

            return ['gerbil_spawn', [step + 1, max]]
          }
        }

        return false;
      }
    }
  });

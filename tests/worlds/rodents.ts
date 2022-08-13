import _Monoid from '../../src/_Monoid'
import { delay } from '../../src/util'
import { Num, Str, Tup } from '../../src/guards/Guard'
import { act } from '../../src/shape/common';
import { World } from '../../src/shape/World';

export const rodents = World
  .shape({
    rat: {
      wake: act(),
      squeak: act(Num)
    },

    hamster: {
      wake: act(Num),
      nibble: act(),
      tarry: act()
    },

    guineaPig: {
      runAbout: act(),
      gruntAt: act(Str)
    },

    gerbil: {
      spawn: act(Tup(Num, Num))
    }
  })
  .impl({
    rat: {
      async wake({next}) {
        return next.rat.squeak(123);
      },

      async squeak({next}, d) {
        return next.$end(`I have squeaked ${d}!`);
      }
    },

    hamster: {
      async wake(x, d) {
        await delay(100);
        return x.act.$end(d);
      },

      async nibble(x) {
        return x.act.$end('done');
      },

      async tarry(x) {
        return x.act.$wait([123, x.act.hamster.nibble()]);
      }
    },

    guineaPig: {
      async runAbout(x) {
        const a = await x.attend({ attended(m) { return [m, 'squeak!'] } });
        return a
          ? x.act.$end(a[0])
          : x.act.$end('BIG NASTY ERROR');
      },

      async gruntAt(x, id) {
        const resp = await x.convene([id], {
          convened([p]) {
            const a = p.chat('grunt!');
            if(a) return a;
            else throw Error('bad response from attendee')
          }
        });
        return x.act.$end(resp[0]);
      }
    },

    gerbil: {
      async spawn(x, [step, max]) {
        if(step < max) {
          const appendage = String.fromCharCode('a'.charCodeAt(0) + step);

          if(x.id.length < max) {
            const other = `${x.id}${appendage}`;

            await x.convene([other], {
              convened([p]) {
                p.chat(x.act.gerbil.spawn([0, max]));
              }
            })

            return x.act.gerbil.spawn([step + 1, max]);
          }
        }

        return false;
      }
    }
  });

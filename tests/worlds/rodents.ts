import _Monoid from '../../src/_Monoid'
import { delay } from '../../src/util'
import { Bool, Num, Str, Tup } from '../../src/guards/Guard'
import { act, root } from '../../src/shape/common';
import { World } from '../../src/shape/World';

export const rodents = World
  .shape({
    rat: {
      wake: root(Str),
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
    },

    capybara: {
      nip: act(Num)
    },

    shrew: act(Tup(Num,Bool))
  })
  .impl({
    rat: {
      async wake({and}) {
        return and.rat.squeak(123);
      },

      async squeak({and}, d) {
        return and.end(`I have squeaked ${d}!`);
      }
    },

    hamster: {
      async wake({and,pause}, d) {
        await pause(100);
        return and.end(d);
      },

      async nibble({and}) {
        return and.end('done');
      },

      async tarry({and}) {
        return and.wait([123, and.hamster.nibble()]);
      }
    },

    guineaPig: {
      runAbout({and,attend}) {
        return attend(m => [m, 'squeak!'])
          .map(a => and.end(a))
          .else(and.end('BIG NASTY ERROR'));
      },

      async gruntAt({and,convene}, id) {
        const resp = await convene([id], async ([p]) => {
          const a = p.chat('grunt!');
          if(a) return a;
          else throw Error('bad response from attendee')
        });
        return and.end(resp[0]);
      }
    },

    gerbil: {
      async spawn({and,convene,id}, [step, max]) {
        if(step < max) {
          const appendage = String.fromCharCode('a'.charCodeAt(0) + step);

          if(id.length < max) {
            const other = `${id}${appendage}`;

            await convene([other], async ([p]) => {
              p.chat(and.gerbil.spawn([0, max]));
            });

            return and.gerbil.spawn([step + 1, max]);
          }
        }

        return false;
      }
    },

    capybara: {
      async nip({and,side}, d) {
        const prevSideVal = (<number|undefined><unknown>side.get()) || 0;
        side.set(prevSideVal + 1);

        if(d > 2) return and.end('yip');
        else return and.capybara.nip(prevSideVal);
      }
    },

    async shrew({and,isFresh,ref}, [v, _]) {
      if(v >= 2) {
        ref
        
        return and.end('yip');
      }

      return and.shrew([v+1, isFresh()]);
    }
  });




import _Monoid from '../../src/_Monoid'
import { World } from '../../src/shape/World';
import { act } from '../../src/shape/common';
import { Many, Str, Tup } from '../../src/guards/Guard';
import { Id } from '../lib';
import { delay } from '../helpers';

export const parakeet = World
  .shape({
    listen: act(),
    chirp: act(Tup(Many(Str), Str)),

    migrate: act(Str),
    nest: act(Tup({}, Str)),

    flapAbout: act()
  })
  .impl({

    listen({and,attend}) {
      return attend(m => [<[Id[], string]>m])
        .map(r => {
          const [ids, m] = r;
          return and.chirp([ids, m]);
        })
        .else(and.end(true));
    },


    async chirp({and,convene}, [ids, message]) {
      const [id, ...otherIds] = ids;

      if(id) {
        const r = await convene([id], async peers => {
          peers.forEach(p => p.chat([otherIds, message]));
          return 'chirped!';
        });
        return and.end(r);
      }

      return and.end('no-one to chirp to!');
    },


    async migrate({and}, destination) {
      return and.$meetAt([destination, and.nest([{}, ''])]);
    },


    nest({and,attend}, d) {
      return attend(m => {
        const k = d[1];

        if(Array.isArray(m) && m[0]==k) {
          switch(m[1]) {
            case 'contribute':
              return [and.nest([{},k]), 'hello'];

            case 'fin':
              return [and.end(m[2])];
          }
        }
      }).else(and.migrate('somewhere...'));
    },

    async flapAbout(x) {
      await delay(30); //would be nice to have a cancellable delay provided here...
      return x.and.flapAbout();
    }

  });

//a nicely typed phase factory
//would solve many of our woes above:
//it would always have a nice type
//no stress on ts to come up with common base tuple 

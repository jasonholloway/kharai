import _Monoid from '../../src/_Monoid'
import { World } from '../../src/shape/World';
import { act } from '../../src/shape/common';
import { Many, Str, Tup } from '../../src/guards/Guard';
import { Id } from '../lib';
import { Attendee } from '../MachineSpace';
import { isArray } from 'util';

export const parakeet = World
  .shape({
    listen: act(),
    chirp: act(Tup(Many(Str), Str)),

    migrate: act(Str),
    nest: act(Tup({}, Str)),
  })
  .impl({

    async listen(x) {
      const r = await x.attend({
        attended([ids, m]) {
          return <[[Id[], string]]>[[ids, m]];
        }
      });

      if(r) {
        const [[ids, m]] = r;
        return x.act.chirp([ids, m]);
      }

      return x.act.$end(true);
    },

    async chirp(x, [ids, message]) {
      const [id, ...otherIds] = ids;

      if(id) {
        const r = await x.convene([id], {
          convened(peers) {
            peers.forEach(p => p.chat([otherIds, message]));
            return 'chirped!';
          }
        });
        return x.act.$end(r);
      }

      return x.act.$end('no-one to chirp to!');
    },


    async migrate(x, destination) {
      return x.act.$meetAt([destination, x.act.nest([{}, ''])]);
    },



    async nest({act,attend}, d) {
      const r = await attend(<Attendee<['nest',[{},string]]|['$end',unknown]>>{
        attended(m) {
          const k = d[1];

          if(isArray(m) && m[0]==k) {
            switch(m[1]) {
              case 'contribute':
                return [act.nest([{},k]), 'hello'];

              case 'fin':
                return [act.$end(m[2])];
            }
          }
        }
      });

      return r ? r[0] : act.migrate('somewhere...');
    }
  });

//a nicely typed phase factory
//would solve many of our woes above:
//it would always have a nice type
//no stress on ts to come up with common base tuple 

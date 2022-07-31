import _Monoid from '../../src/_Monoid'
import { World } from '../../src/shape/World';
import { act } from '../../src/shape/common';
import { Many, Str } from '../../src/guards/Guard';
import { Id } from '../lib';

export const parakeet = World
  .shape({
    listen: act(),
    chirp: act([Many(Str), Str] as const),
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
        return ['chirp', [ids, m]]
      }

      return ['$end', true];
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
        return ['$end', r];
      }

      return ['$end', 'no-one to chirp to!'];
    }
  });

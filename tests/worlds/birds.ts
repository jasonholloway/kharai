import _Monoid from '../../src/_Monoid'
import { toArray, take } from 'rxjs/operators'
import { Str, Num, Many } from '../../src/guards/Guard'
import { World } from '../../src/shape/World'
import { act } from '../../src/shape/common'

export const birds = World
  .shape({
    track: act([Many(Str), Num] as const),
    runAround: act(Num),
  })
  .impl({
    async runAround({and}, n) {
      if(n > 0) {
        // await delay(20);

        return and.runAround(n-1);
      }

      return false;
    },

    async track({and,watch}, [ids, c]) {
      const frames = await watch(ids)
        .pipe(take(c), toArray())
        .toPromise();

      return and.end(frames);
    }
  });


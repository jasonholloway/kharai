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
    async runAround(_, n) {
      if(n > 0) {
        // await delay(20);

        return ['runAround', n-1]
      }

      return false;
    },

    async track(x, [ids, c]) {
      const frames = await x.watch(ids)
        .pipe(take(c), toArray())
        .toPromise();

      return ['end', frames];
    }
  });


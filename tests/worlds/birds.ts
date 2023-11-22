import { describe, expect, it } from '@jest/globals';
import _Monoid from '../../src/_Monoid'
import { mergeMap, toArray, take } from 'rxjs/operators'
import { Str, Num, Many } from '../../src/guards/Guard'
import { World } from '../../src/shape/World'
import { act, root } from '../../src/shape/common'
import { from } from 'rxjs'

export const birds = World
  .shape({
    track: act([Many(Str), Num] as const),
    runAround: root(Num),
  })
  .impl({
    async runAround({and,ref}, n) {
      if(n > 0) {
        // await delay(20);
        ref

        return and.runAround(n-1);
      }

      return false;
    },

    async track({and,watchRaw}, [ids, c]) {
      const frames = await from(ids)
        .pipe(mergeMap(watchRaw), take(c), toArray())
        .toPromise();

      return and.end(frames);
    }
  });


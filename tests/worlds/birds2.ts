import _Monoid from '../../src/_Monoid'
import { toArray, take } from 'rxjs/operators'
import { delay } from '../../src/util'
import { Str, Num, Many, Any } from '../../src/guards/Guard'
import { $root } from '../../src/shapeShared'
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
        await delay(20);

        return ['runAround', n-1]
      }

      return false;
    },

    async track(x, [ids, c]) {
      const frames = await x.watch(ids)
        .pipe(take(c), toArray())
        .toPromise();

      return ['$end', frames];
    }
  });


const Scraper = {
  scrape: act(Num),
  notify: act([/http.*/] as const)
};

const w = World
  .shape({
    AO: Scraper,
    Very: Scraper,
    Argos: Scraper
  })
  .impl({
    AO: {
      async scrape(x, n) {
        console.log(n + 13);

        //do something here...
        await Promise.resolve();

        return ['AO_notify', ['https://someurl']]
      },

      async notify(x, d) {
        return ['$wait', [100, ['AO_scrape', 123]]]
      }
    },

    Very: {
      async scrape(x, d) {
        //do something here...
        await Promise.resolve();

        return ['$wait', [100000, ['Very_notify', ['moo']]]]
      }
    }
  });

  

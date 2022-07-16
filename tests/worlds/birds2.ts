import _Monoid from '../../src/_Monoid'
import { toArray, take } from 'rxjs/operators'
import { delay } from '../../src/util'
import { Str, Num, Many, Any } from '../guards/Guard'
import { $root, act } from '../../src/shapeShared'
import { World } from '../../src/shape/World'

export const birds = World
  .shape({
    $boot: act([]),
    $end: act([Many(Any)] as const),
    // $wait: data([Num, me] as const),

    emu: {
      track: act([Many(Str), Num] as const),
      runAround: act([Num] as const),
    }
  })
  .impl({
    emu: {
      async runAround(x, [n]) {
        if(n > 0) {
          await delay(20);
          
          return ['emu_runAround', [n-1]]
        }

        return false;
      },

      async track(x, [ids, c]) {
        const frames = await x.watch(ids)
          .pipe(take(c), toArray())
          .toPromise();

        return ['$end', [frames]];
      }
    }
  });


const Scraper = {
  scrape: act(Num),
  notify: act([/http.*/] as const)
};

const w = World.shape({
    $boot: act([]),
    $end: act([Many(Any)] as const),
    $wait: act([Num, $root] as const),

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

  

import _Monoid from '../../src/_Monoid'
import { toArray, take } from 'rxjs/operators'
import { delay } from '../../src/util'
import { Str, Num, Many, Any, Read } from '../guards/Guard'
import { shape } from '../../src/shape'
import { $root, data } from '../../src/shapeShared'
import { Observable } from 'rxjs'

const w1 = shape({
    $boot: data([]),
    $end: data([Many(Any)] as const),
    // $wait: data([Num, me] as const),

    emu: {
      track: data([Many(Str), Num] as const),
      runAround: data([Num] as const),
    }
  })
  .facImpl('', () =>({
    watch(ids: string[]): Observable<unknown> {
      throw 123;
    }
  }));


const w2 = w1
  .facImpl('emu', x => ({ moo:123 }));

const w3 = w2
  .impl({
    emu: {
      async runAround(x, [n]) {
        if(n > 0) {
          await delay(20);
          
          return ['emu_runAround', [n-1]]
        }

        return false;
      }
    }
  });

const w4 = w3
  .impl({
    emu: {
      async track(x, [ids, c]) {
        const frames = await x.watch(ids)
          .pipe(take(c), toArray())
          .toPromise();

        return ['$end', [frames]];
      }
    }
  });


const Scraper = {
  scrape: data(Num),
  notify: data([/http.*/] as const)
};

const w = shape({
    $boot: data([]),
    $end: data([Many(Any)] as const),
    $wait: data([Num, $root] as const),

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

  

import { Num } from "../guards/Guard";
import { LocalStore } from "../LocalStore";
import { newRun } from "../Run";
import { act } from "../shape/common";
import { World } from "../shape/World";

const world = World
  .shape({
    mole: {
      sayHello: act(Num)
    }
  })
  .impl({
    mole: {
      async sayHello(x, n) {
        return ['$wait', [Date.now() + 1000, ['mole_sayHello', n + 1]]];
      }
    }
  })
  .build();

const store = new LocalStore();
const x = newRun(world, store, store);

Promise.all([
  x.log$,
  x.boot('morris', ['mole_sayHello', 0])
]);





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

  

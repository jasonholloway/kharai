import { Num } from "../guards/Guard";
import { LocalStore } from "../LocalStore";
import { newRun } from "../Run";
import { act } from "../shape/common";
import { World } from "../shape/World";

const Scraper = {
  scrape: act(Num),
  notify: act([/http.*/] as const)
};

const world = World
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

        return ['AO_notify', ['https://someurl']]
      },

      async notify(x, d) {
        return ['$wait', [500, ['AO_scrape', 123]]]
      }
    },

    Very: {
      async scrape(x, d) {
        //do something here...
        await Promise.resolve();

        return ['$wait', [5000, ['Very_notify', ['moo']]]]
      },

      async notify(x, d) {
        return ['$wait', [5000, ['Very_scrape', 123]]]
      }
    }
  })
  .build();


const store = new LocalStore();
const x = newRun(world, store, store);

Promise.all([
  x.log$,
  x.boot('ao', ['AO_scrape', 0]),
  x.boot('very', ['Very_scrape', 0])
]);



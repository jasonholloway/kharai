import { Num, Tup } from "../guards/Guard";
import { LocalStore } from "../LocalStore";
import { newRun } from "../Run";
import { act } from "../shape/common";
import { World } from "../shape/World";

const Scraper = {
  scrape: act(Num),
  notify: act(Tup(/http.*/))
};

const world = World
  .shape({
    AO: Scraper,
    Very: Scraper,
    Argos: Scraper
  })
  .impl({
    AO: {
      async scrape({and}, n) {
        console.log(n + 13);
        //https://ao.com/l/fridges-free_standing/1-9/29-30/
        //do something here...
        return and.AO.notify(['https://someurl']);
      },

      async notify({and}, d) {
        return and.wait([500, and.AO.scrape(123)]);
      }
    },

    Very: {
      async scrape({and}, d) {
        //do something here...
        await Promise.resolve();
        return and.wait([5000, and.Very.notify(['moo'])]);
      },

      async notify({and}, d) {
        return and.wait([5000, and.Very.scrape(123)]);
      }
    }
  })
  .build();


const store = new LocalStore();
const x = newRun(world, store, store);

Promise.all([
  x.log$,
  x.boot('ao', ['M_AO_scrape', 0]),
  x.boot('very', ['M_Very_scrape', 0])
]);



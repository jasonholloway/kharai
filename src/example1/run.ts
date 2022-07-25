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
        console.log(`Hello! (${n})`)
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


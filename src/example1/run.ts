import { Num, Str } from "../guards/Guard";
import { LocalStore } from "../LocalStore";
import { newRun } from "../Run";
import { act } from "../shape/common";
import { World } from "../shape/World";

const world = World
  .shape({
    mole: {
      sayHello: act([Str, Num] as const)
    }
  })
  .impl({
    mole: {
      async sayHello({and, convene}, [friend, n]) {
        if(n < 20) {
          console.log(`Hello! (I have been saying hello for ${n} seconds)`)

          // await x.attend({
          //   chat(m, peers) {

          //   }
          // });

          // but if two try to invite each other...
          // they should happily find each other, surely...
          //

          await convene([friend], ([met]) => {
            if(met) {
              met.chat('hullo');
            }
          });
          
          return and.wait([Date.now() + 1000, and.mole.sayHello([friend, n+1])]);
        }
        else {
          return and.end('RIP');
        }
      }
    }
  })
  .build();

const store = new LocalStore();
const x = newRun(world, store, store);

Promise.all([
  x.log$,
  x.boot('morris', ['M_mole_sayHello', ['mary', 0]]),
  x.boot('mary', ['M_mole_sayHello', ['morris', 0]])
]);


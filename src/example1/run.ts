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
      async sayHello(x, [friend, n]) {
        if(n < 20) {
          console.log(`Hello! (I have been saying hello for ${n} seconds)`)

          // await x.attend({
          //   chat(m, peers) {

          //   }
          // });

          // but if two try to invite each other...
          // they should happily find each other, surely...
          //

          await x.convene([friend], {
            receive([met]) {
              if(met) {
                met.chat('hullo');
              }
            }
          });
          
          return ['$wait', [Date.now() + 1000, ['mole_sayHello', [friend, n + 1]]]];
        }
        else {
          return ['$end', 'RIP']
        }
      }
    }
  })
  .build();

const store = new LocalStore();
const x = newRun(world, store, store);

Promise.all([
  x.log$,
  x.boot('morris', ['mole_sayHello', ['mary', 0]]),
  x.boot('mary', ['mole_sayHello', ['morris', 0]])
]);


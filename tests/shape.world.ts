import { describe, expect, it } from '@jest/globals';
import { act, ctx } from "../src/shape/common";
import { Num } from "../src/guards/Guard";
import { World } from "../src/shape/World";

export const world = World
  .shape({
    // ...ctx<{ a:number }>(),

    jerboa: {
      // ...ctx<{ b:readonly number[], bb:number }>(),

      squeak: act(Num),
      burrow: act(456),

      jump: {
        // ...ctx<{ c:string }>(),

        quickly: act(789),
        slovenly: act('boo')
      }
    },

    fridge: {
      ...act(),
      // scrape: act(123)
    }
  })
  .ctx(x => ({ a:1 }))
  .ctx(x => ({ b:[0, x.a], bb:0 }))
  .ctx(() => ({ c:'hullo' }))
  .impl({
    jerboa: {
      async squeak({and}, d) {
        return and.jerboa.squeak(d);
      },

      async burrow({and}, d) {
        return and.jerboa.jump.quickly(789);
      },

      jump: {
        async slovenly({and}, d) {
          console.log(`hello ${d}`);
          return and.jerboa.jump.quickly(789);
        }
      },
    },

    fridge: {
      async act() { return false; },
    }
  });

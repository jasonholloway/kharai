import { act, ctx } from "../src/shape/common";
import { Num } from "../src/guards/Guard";
import { World } from "../src/shape/World";

export const world = World
  .shape({
    ...ctx<{ a:number }>(),

    jerboa: {
      ...ctx<{ b:readonly number[], bb:number }>(),

      squeak: act(Num),
      burrow: act(456 as const),

      jump: {
        ...ctx<{ c:string }>(),

        quickly: act(789 as const),
        slovenly: act('boo' as const)
      }
    }
  })
  .ctxImpl('', x => ({ a:1 }))
  .ctxImpl('jerboa', x => ({ b:[0, x.a], bb:0 }))
  .ctxImpl('jerboa_jump', () => ({ c:'hullo' }))
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
      }
    }
  });

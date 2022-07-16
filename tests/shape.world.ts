import { act, ctx } from "../src/shapeShared";
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
  .ctxImpl('', () => ({ a:1 }))
  .ctxImpl('jerboa', x => ({ b:[0, x.a], bb:0 }))
  .ctxImpl('jerboa_jump', () => ({ c:'hullo' }))
  .impl({
    jerboa: {
      async squeak(x, d) {

        x;
        return ['jerboa_squeak', d];
      },

      async burrow(x, d) {
        x; d
        return ['jerboa_jump_quickly', 789]
      },

      jump: {
        async slovenly(x, d) {
          x;
          console.log(`hello ${d}`);
          return ['jerboa_jump_quickly', 789];
        }
      }
    }
  });

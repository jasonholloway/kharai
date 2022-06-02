import { shape } from "../src/shape";
import { data, fac } from "../src/shapeShared";
import { Num } from "../src/guards/Guard";

describe('shape', () => {
  
  const w0 = shape({
    ...fac<{ a:number }>(),

      jerboa: {
        ...fac<{ b:number[] }>(),

        squeak: data(Num),
        burrow: data(456 as const),

        jump: {
          ...fac<{ c:string }>(),

          quickly: data(789 as const),
          slovenly: data('boo' as const)
        }
      }
    })
    .facImpl('', () => ({ a:1 }))
    .facImpl('jerboa', x => ({ b:[0, x.a] }))
    .facImpl('jerboa_jump', () => ({ c:'hullo' }))
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
            console.log(`hello ${d}`);
            return ['jerboa_jump_quickly', 789];
          }
        }
      }
    });

  it('resolves handlers', () => {
    const r1 = w0.read('jerboa_squeak');
    expect(r1.guard).toEqual([Num])
    expect(r1.handler).not.toBeUndefined();

    const r2 = w0.read('jerboa_jump_quickly');
    expect(r2.guard).toEqual([789])
    expect(r2.handler).toBeUndefined();
  })

  it('resolves facs', () => {
    const r1 = w0.read('jerboa_squeak');
    const x1 = r1.fac?.call({},{});
    expect(x1).toHaveProperty('a', 1);
    expect(x1).toHaveProperty('b', [0, 1]);
    
    const r2 = w0.read('jerboa_jump_quickly');
    const x2 = r2.fac?.call({},{});
    expect(x2).toHaveProperty('a', 1);
    expect(x2).toHaveProperty('b', [0, 1]);
    expect(x2).toHaveProperty('c', 'hullo');
  })

  it('combines node trees', () => {
    const merged = w0.add(
      shape({
        jerboa: {
          ...fac<{ z: 999 }>(),

          nibble: {
            ...fac<{ z: 999 }>(),
            furtively: data(789 as const)
          }
        }
      }))
      .facImpl('jerboa_nibble', x => ({ z: 999 as const }));

    merged.nodes.D_jerboa_squeak,
    merged.nodes.D_jerboa_nibble_furtively

    const r0 = merged.read('jerboa_squeak');
    expect(r0.guard).toEqual([Num]);

    const r1 = merged.read('jerboa_nibble_furtively');
    expect(r1.guard).toEqual([789]);

    const x1 = r1.fac?.call({},{})
    expect(x1).toEqual({
      a: 1,
      b: [0, 1],
      z: 999
    })
  })

  //TODO should enforce types on merge too
  //fac types can be expanded
  //but data types are invariant (can shadow, but not extend)
  //facs should be merged in one by one too - so you don't have to reimpl the entire thing

})


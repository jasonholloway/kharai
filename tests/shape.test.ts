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
    const w =
      shape({
        jerboa: {
          squeak: data(123 as const),
        }
      })
      .add(shape({
        jerboa: {
          jump: {
            quick: data(789 as const)
          }
        }
      }));

    const r = w.nodes
    r

    expect(w.nodes).toHaveProperty('D_jerboa_squeak')
    expect(w.nodes.D_jerboa_squeak).toBe(123)
    expect(w.nodes.D_jerboa_jump_quick).toBe(789)
  })

  it('combines nodes', () => {
    const w =
      shape({
        jerboa: {
          squeak: data(123 as const),
        }
      })
      .add(
        shape({
          jerboa: {
            squeak: fac({ hello: 1 })
          }
        })
      );

    expect(w.nodes).toHaveProperty('D_jerboa_squeak')
    expect(w.nodes.D_jerboa_squeak).toBe(123)
    expect(w.nodes.X_jerboa_squeak.hello).toBe(1)
  })

  it('adds facs', () => {
    const w =
      shape({
        jerboa: {
          squeak: data(123 as const),
        }
      })
      .facImpl('jerboa', () => 1 as const)

    expect(w.nodes.X_jerboa).toBe(1)
  })

  it('types facs from upstreams', () => {
    const w =
      shape({
        jerboa: {
          squeak: data(123 as const),
        }
      })
      .facImpl('', () => ({ a:1 }))
      .facImpl('jerboa', u => ({ b: u.a + 1 }))

    expect(w.nodes.X_jerboa).toBe({ a:1, b:2 });
  })
})


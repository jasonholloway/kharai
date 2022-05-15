import { shape } from "../src/shape";
import { data, fac } from "../src/shapeShared";

describe('shape', () => {

  it('builds node map from tree', () => {
    const w = shape({
        jerboa: {
          squeak: data(123 as const),
          burrow: data(456 as const),
          jump: {
            quickly: data(789 as const)
          }
        }
      })
      .fac('', () => ({ baa: 0 }))
      .fac('jerboa', () => ({ moo: 1 as const }))
      .fac('jerboa_jump', () => ({ neigh: 2 as const }))
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
            async quickly(x, d) {
              x; d
              throw 123
            }
          }
        }
      });

    w.nodes.D_jerboa_burrow

    const r1 = w.read(['jerboa_squeak', 123]);
    expect(r1.errors).toBeUndefined();
    expect(r1).toHaveProperty('isValid', true);

    const r2 = w.read(['jerboa_jump_quickly', 789]);
    expect(r2.errors).toBeUndefined();
    expect(r2).toHaveProperty('isValid', true);
  })

  it('combines node trees', () => {
    const w =
      shape(_ => ({
        jerboa: {
          squeak: data(123 as const),
        }
      }))
      .add(shape(_ => ({
        jerboa: {
          jump: {
            quick: data(789 as const)
          }
        }
      })));

    const r = w.nodes
    r

    expect(w.nodes).toHaveProperty('D_jerboa_squeak')
    expect(w.nodes.D_jerboa_squeak).toBe(123)
    expect(w.nodes.D_jerboa_jump_quick).toBe(789)
  })

  it('combines nodes', () => {
    const w =
      shape(_ => ({
        jerboa: {
          squeak: data(123 as const),
        }
      }))
      .add(
        shape(_ => ({
          jerboa: {
            squeak: fac({ hello: 1 })
          }
        }))
      );

    expect(w.nodes).toHaveProperty('D_jerboa_squeak')
    expect(w.nodes.D_jerboa_squeak).toBe(123)
    expect(w.nodes.X_jerboa_squeak.hello).toBe(1)
  })

  it('adds facs', () => {
    const w =
      shape(_ => ({
        jerboa: {
          squeak: data(123 as const),
        }
      }))
      .fac('jerboa', () => 1 as const)

    expect(w.nodes.X_jerboa).toBe(1)
  })

  it('types facs from upstreams', () => {
    const w =
      shape(_ => ({
        jerboa: {
          squeak: data(123 as const),
        }
      }))
      .fac('', () => ({ a:1 }))
      .fac('jerboa', u => ({ b: u.a + 1 }))

    expect(w.nodes.X_jerboa).toBe({ a:1, b:2 });
  })
})


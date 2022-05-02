import { shape } from "../src/shape";
import { data, fac, space } from "../src/shapeShared";

describe('shape', () => {

  it('builds node map from tree', () => {
    const w = shape(_ => space({
      jerboa: space({
        squeak: data(123 as const),
        burrow: data(456 as const),
        syrian: space({
          grumpAbout: data(789 as const)
        })
      })
    }));

    expect(w.nodes).toBe({
    })

    expect(w.nodes).toHaveProperty('D_jerboa_squeak')
    expect(w.nodes).toHaveProperty('D_jerboa_burrow')
    expect(w.nodes.D_jerboa_syrian_grumpAbout).toBe(789)
  })

  it('combines node trees', () => {
    const w =
      shape(_ => space({
        jerboa: space({
          squeak: data(123 as const),
        })
      }))
      .add(
        shape(_ => space({
          jerboa: space({
            syrian: space({
              grumpAbout: data(789 as const)
            })
          })
        }))
      );

    const r = w.nodes
    r

    expect(w.nodes).toHaveProperty('D_jerboa_squeak')
    expect(w.nodes.D_jerboa_squeak).toBe(123)
    expect(w.nodes.D_jerboa_syrian_grumpAbout).toBe(789)
  })

  it('combines nodes', () => {
    const w =
      shape(_ => space({
        jerboa: space({
          squeak: data(123 as const),
        })
      }))
      .add(
        shape(_ => space({
          jerboa: space({
            squeak: fac({ hello: 1 })
          })
        }))
      );

    expect(w.nodes).toHaveProperty('D_jerboa_squeak')
    expect(w.nodes.D_jerboa_squeak).toBe(123)
    expect(w.nodes.X_jerboa_squeak.hello).toBe(1)
  })

  it('adds facs', () => {
    const w =
      shape(_ => space({
        jerboa: space({
          squeak: data(123 as const),
        })
      }))
      .addFac('jerboa', () => 1 as const)

    expect(w.nodes.X_jerboa).toBe(1)
  })

  it('types facs from upstreams', () => {
    const w =
      shape(_ => space({
        jerboa: space({
          squeak: data(123 as const),
        })
      }))
      .addFac('', () => ({ a:1 }))
      .addFac('jerboa', u => ({ b: u.a + 1 }))

    expect(w.nodes.X_jerboa).toBe({ a:1, b:2 });
  })
})


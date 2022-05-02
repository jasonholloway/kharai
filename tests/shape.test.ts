import { shape } from "../src/shape";
import { data, fac, space } from "../src/shapeShared";

describe('shape', () => {

  it('builds node map from tree', () => {
    const w = shape(_ => space({
      hamster: space({
        squeak: data(123 as const),
        burrow: data(456 as const),
        syrian: space({
          grumpAbout: data(789 as const)
        })
      })
    }));

    const r = w.nodes
    r

    expect(w.nodes).toHaveProperty('D_hamster_squeak')
    expect(w.nodes).toHaveProperty('D_hamster_burrow')
    expect(w.nodes.D_hamster_syrian_grumpAbout).toBe(789)
  })

  it('combines node trees', () => {
    const w =
      shape(_ => space({
        hamster: space({
          squeak: data(123 as const),
        })
      }))
      .add(
        shape(_ => space({
          hamster: space({
            syrian: space({
              grumpAbout: data(789 as const)
            })
          })
        }))
      );

    const r = w.nodes
    r

    expect(w.nodes).toHaveProperty('D_hamster_squeak')
    expect(w.nodes.D_hamster_squeak).toBe(123)
    expect(w.nodes.D_hamster_syrian_grumpAbout).toBe(789)
  })

  it('combines nodes', () => {
    const w =
      shape(_ => space({
        hamster: space({
          squeak: data(123 as const),
        })
      }))
      .add(
        shape(_ => space({
          hamster: space({
            squeak: fac({ hello: 1 })
          })
        }))
      );

    const r = w.nodes
    r

    expect(w.nodes).toHaveProperty('D_hamster_squeak')
    expect(w.nodes.D_hamster_squeak).toBe(123)
    expect(w.nodes.X_hamster_squeak.hello).toBe(1)
  })

  it('adds facs', () => {
    const w =
      shape(_ => space({
        hamster: space({
          squeak: data(123 as const),
        })
      }))
      .addFac('hamster', () => 1 as const)

    expect(w.nodes.X_hamster).toBe(1)
  })

  it('types facs from upstreams', () => {
    const w =
      shape(_ => space({
        hamster: space({
          squeak: data(123 as const),
        })
      }))
      .addFac('', () => ({ a:1 }))
      .addFac('hamster', u => ({ b: u.a + 1 }))

    expect(w.nodes.X_hamster).toBe({ a:1, b:2 });
  })
})


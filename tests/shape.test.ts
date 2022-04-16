import { shape } from "../src/shape";
import { data, space } from "../src/shapeShared";

describe('shape', () => {

  it('builds node map from tree', () => {

    const w = shape(root => space({
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

    expect(w.nodes).toHaveProperty('_hamster_squeak')
    expect(w.nodes).toHaveProperty('_hamster_burrow')
    expect(w.nodes._hamster_syrian_grumpAbout.data).toBe(789)
  })

  xit('combines node trees', () => {
    throw 'todo'
  })

})


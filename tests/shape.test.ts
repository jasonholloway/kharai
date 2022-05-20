import { shape } from "../src/shape";
import { data, fac } from "../src/shapeShared";
import { Num } from "../src/guards/Guard";

describe('shape', () => {

  it('builds node map from tree', () => {
    const w = shape({
        jerboa: {
          squeak: data(Num),
          burrow: data(456 as const),
          jump: {
            quickly: data(789 as const),
            slovenly: data('boo' as const)
          }
        }
      })
      .fac('', x => ({ baa: 0 }))
      .fac('jerboa', x => ({ moo: 1 as const }))
      .fac('jerboa_jump', x => ({ neigh: 2 as const }))
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
              console.log('hello');
              return ['jerboa_jump_quickly', 789];
            },
            
            async quickly(x, d) {
              x; d
              return ['jerboa_squeak', 13];
            }
          }
        }
      });

    const r1 = w.read('jerboa_squeak');
    expect(r1.guard).toEqual([Num])
    expect(r1.handler).not.toBeUndefined();

    const r2 = w.read('jerboa_jump_quickly');
    expect(r2.guard).toEqual([789])
    expect(r2.handler).not.toBeUndefined();

    const r3 = w.read('jerboa_squeak');
    expect(r3.guard).toEqual([Num])
    expect(r3.handler).not.toBeUndefined();

    const x1 = r1.fac?.summon({});
    expect(x1).toHaveProperty('baa', 0);
    expect(x1).toHaveProperty('moo', 1);
    
    const x2 = r2.fac?.summon({});
    expect(x2).toHaveProperty('baa', 0);
    expect(x2).toHaveProperty('moo', 1);
    expect(x2).toHaveProperty('neigh', 2);
  })

  // FacNodes should be bound immediately to Impls
  // so, the link is to be made in Registry
  // 
  // when a handler is registered, it captures the FacNodes of its vicinity
  // but then we can't override existing facs? we could if there were contracts
  //
  // and we need fac contracts to share common upstream implementations
  // or each module resupplies from above, which is rubbish, as we might have lots of modules
  // 
  // if we're not resupplying new FacNodes over and over again,
  // then our handlers must know that certain facs are at least to be supplied
  //
  // the overall idea is that facs can be part of the shape, along with data
  // and that shapes can be merged as long as... well, they will be overwritten
  // as data determines input and output contracts, there is no variance
  //
  // so, as with handlers, there will be facs that fulfil declared contracts?
  // but then our FacNode graph has something to say about this surely
  // our FacNode graph allows us to overlay new facs without breaking previous bindings
  // and it forces us to build from the bottom up
  // we need a root before we can program against the branches
  //
  // in fact this problem of bottom-up has already been met: we are relying on providing access to the runtime via an untyped replacable backdoor ref
  // as the runtime is only available after specification
  // now this challenge has been made more general
  // 
  //
  //

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
      .fac('jerboa', () => 1 as const)

    expect(w.nodes.X_jerboa).toBe(1)
  })

  it('types facs from upstreams', () => {
    const w =
      shape({
        jerboa: {
          squeak: data(123 as const),
        }
      })
      .fac('', () => ({ a:1 }))
      .fac('jerboa', u => ({ b: u.a + 1 }))

    expect(w.nodes.X_jerboa).toBe({ a:1, b:2 });
  })
})


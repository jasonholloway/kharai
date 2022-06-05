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

  //TODO facimpl types should fold existing X types into upstream
  //all context types should be tuples, with the types accumulating then
  //but: we don't care about the history of impls
  //we care about the distinction between implemented and non-implemented
  //
  //it's this idea again that implementations should change the node graph
  //at every fac node we have the shape that handlers and downstream facs will use
  //but we also potentially have the currently-available context, provided by an existing implementation
  //this is a special case when we have a fac left hanging, unimplemented
  //
  //as soon as we add an implementation, the hangingness is gone
  //similarly as soon as we add a shape, then we have a hanging type
  //
  //adding a shape:
  //if there's a simple type there already (because a fac has been implemented at this node)
  //then we can extend it happily
  //
  //but if it's a tuple, then we have this incomplete split
  //one half gets folded into the upstream context
  //the other half gets used for handlers and downstream facs
  //
  //if we're resolving the context of something downstream (either fac or handler)
  //then we don't even look at the LHS: if there's a gap in the implementation,
  //it's not our business (although something will need to enforce the implementation)
  //
  //adding a fac to a shape doesn't just set the type directly then: it either creates 
  //a new tuple to represent its unfulfilled expectation, building from an existing implementation (or empty obj by default)
  //
  //maybe it could _always_ be a tuple, with local upstream and exposed contract together
  //on implementation, the two types are harmonized into one tuple of two
  //
  //this is nice, but for the duplication of potentially complex types
  //if they are the same, we could optimize by just having a single type then - _as an optimization_, ie we don't need to do this up front
  //
  //so - all X types are binary tuples
  //LHS: preexisting supplied type
  //RHS: offered downstream type
  //
  //when there is already a tuple in existence,
  //then our implementation derives from the pre-existing implementation, and offers a potentially new, merged contract
  //
  //----
  //
  //but that does for deriving, what about merging?
  // [{}, {a:1}] * [{}, {b:2}] = [{},{a:1,b:2}]
  //
  // [{a:1}, {a:1,b:2}] * [{},{c:3}] = [{a:1}, {a:1,b:2,c:3}]
  // basically we just merge each component (as implementations will be concatted)
  //
  // but...
  // given the above type, we then have an unimplemented fac
  //
  //

  it('can expand facs', () => {
    const w1 = w0.add(
      shape({
        jerboa: {
          ...fac<{ j: [number,number] }>()
        }
      }))
      .facImpl('jerboa', x => ({ j: [1, x.b[0]] }));

    const r0 = w1.read('jerboa_squeak');
    const x0 = r0.fac?.call({}, {});

    expect(x0).toEqual({
      a: 1,
      b: [0, 1],
      j: [1, 1]
    });
  })

  //TODO should enforce types on merge too
  //fac types can be expanded
  //but data types are invariant (can shadow, but not extend)
  //facs should be merged in one by one too - so you don't have to reimpl the entire thing

})


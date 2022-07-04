import { shape, TryBuildWorld } from "../src/shape";
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
    const w = w0.build();
    
    const r1 = w.read('jerboa_squeak');
    expect(r1.guard).toEqual([Num])
    expect(r1.handler).not.toBeUndefined();

    const r2 = w.read('jerboa_jump_quickly');
    expect(r2.guard).toEqual([789])
    expect(r2.handler).toBeUndefined();
  })

  it('resolves facs', () => {
    const w = w0.build();

    const r1 = w.read('jerboa_squeak');
    const x1 = r1.fac?.call({},{});
    expect(x1).toHaveProperty('a', 1);
    expect(x1).toHaveProperty('b', [0, 1]);
    
    const r2 = w.read('jerboa_jump_quickly');
    const x2 = r2.fac?.call({},{});
    expect(x2).toHaveProperty('a', 1);
    expect(x2).toHaveProperty('b', [0, 1]);
    expect(x2).toHaveProperty('c', 'hullo');
  })

  it('facs covariant only', () => {

    const b0 = shape({
      ...fac<{a:1}>()
    });

    const b1 = b0.add(shape({
      ...fac<{a:2}>()
    }));

    //TODO
    //above should be impossible
    //or rather, it should return an error type

    //better to throw errors as soon as poss
    //so not as part of the build, but even on the add
    //in fact it has to be done there
    //on the add

    //so a merge but... more expensive...
    //not actually sure how to escape this aspect
    //as this will happen on every merge
    //but - as long as its not exponential then we should be good

    //
    // what else can we do to preserve the cheapness of merging?
    // my initial idea was to add multiples, preserving info
    // the issue here is that the emplacing of a fac becomes expensive still
    // though it is true the merging is maintained
    // but - this is not the case, as there is logic involved in consolidating different multiples
    // we can't just merge with wild abandon as before
    // still we need to check for the presence of others
    // so we wouldn't gain anything...
    //
    // best cheapness is with simple merging and inadvertant shadowing
    // but this doesn't combine, it just overwrites...
    //
    // if we are to merge, what is the cost of it?
    // phases are merged, in a simple-ish way - no variance is allowed, but we have to test for type identity at least
    // facs are merged with covariance in play
    //

    const _ = b1.build();
  })

  it('combines node trees', () => {
    const w = w0.add(
      shape({
        jerboa: {
          ...fac<{ z: 111 }>(),

          nibble: {
            ...fac<{ z: 999, z0: number }>(),
            furtively: data(789 as const)
          },

          jump: {
            ...fac<{ c0: string }>()
          }
        }
      }))
      .facImpl('jerboa_nibble', x => ({ z: 999 as const, z0: x.z }))
      .build();

    //todo
    //new implementations should merge with existing?
    //think we said this before: facs can expand

    //so above fac expansions are actually illegal and should fail...
    //so shape either returns error or a builder

    w.nodes.D_jerboa_squeak,
    w.nodes.D_jerboa_nibble_furtively
    w.nodes.X_jerboa_nibble

    const r0 = w.read('jerboa_squeak');
    expect(r0.guard).toEqual([Num]);

    const r1 = w.read('jerboa_nibble_furtively');
    expect(r1.guard).toEqual([789]);

    const x1 = r1.fac?.call({},{})
    expect(x1).toEqual({
      a: 1,
      b: [0, 1],
      z: 999,
      z0: 111    //problem here is that upstream z is never actually implemented!!!
    })

    // **************************
    // TODO we need to check that all are implemented - a build step?
    // otherwise we get undefineds in the system as above
    // **************************

    // **************************
    // TODO expanded, overwritten facs should extend rather than replace
    // ie their outputs should be implicitly merged
    // at the type level
    // **************************
  })

  it('can expand facs', () => {
    const w1 = w0.add(
      shape({
        jerboa: {
          ...fac<{ j: readonly [number,number] }>()
        }
      }));

    const b = w1
      .facImpl('jerboa', x => ({ j: [1, x.b[1]] as const }))
      .build();

    const r0 = b.read('jerboa_squeak');
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

  //fac types can be expanded
  //which means, XA should be merged...
  //
  //if we're going to implicitly merge facs (we should)
  //facImpls must be allowed to be partial impls
  //TODO *****

})


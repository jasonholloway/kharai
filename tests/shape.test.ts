import { act, incl } from "../src/shape/common";
import { Any, Num, Str } from "../src/guards/Guard";
import { World } from "../src/shape/World";

describe('shape', () => {

  it('finds guards and handler', () => {
    const w = World
      .shape({
        baa: act(),
        bleat: {
          moo: act(Num)
        }
      })
      .impl({
        async baa() { return false },
        bleat: {
          async moo() { return false },
        }
      })
      .build();

    console.debug(w.nodeMap.toJSON());

    const baa = w.read('baa');
    expect(baa.guard).toBe(Any);
    expect(baa.handler).toBeTruthy();
    expect(baa.fac).toBeTruthy();

    const moo = w.read('bleat_moo');
    expect(moo.guard).toBe(Num);
    expect(moo.handler).toBeTruthy();
    expect(moo.fac).toBeTruthy();
  })

  it('does templates', () => {
    const animal = (sound:string) => World
      .shape({
        encounter: act(Str)
      })
      .impl({
        async encounter({and}) {
          return and.end(sound);
        }
      })
      .seal();
    
    const w = World
      .shape({
        sheep: incl(animal('baa')),
        cattle: {
          cow: incl(animal('moo'))
        }
      })
      .build();

    console.debug(w.nodeMap.toJSON());

    const sheep = w.read('sheep_encounter');
    expect(sheep.guard).toBe(Str);
    expect(sheep.handler).toBeTruthy();
    expect(sheep.fac).toBeTruthy();

    const cow = w.read('cattle_cow_encounter');
    expect(cow.guard).toBe(Str);
    expect(cow.handler).toBeTruthy();
    expect(cow.fac).toBeTruthy();
  })

  it('does templates, with spread root handlers', () => {
    const animal = (sound:string) => World
      .shape({
        ...act(Num),
        encounter: act(Str)
      })
      .impl({
        async act() {
          return false;
        },
        
        async encounter({and}) {
          return and.end(sound);
        }
      })
      .seal();

    const a = animal('');
    a.reg.debug();
    
    const w = World
      .shape({
        sheep: incl(animal('baa')),
        cattle: {
          cow: incl(animal('moo'))
          //TODO get rid of incl - it's ugly
        }
      })
      .build();

    //TODO root phase types not making it through build

    //TODO encounter guard not making it

    console.debug(w.nodeMap.toJSON());

    const sheep = w.read('sheep_encounter');
    expect(sheep.guard).toBe(Str);
    expect(sheep.handler).toBeTruthy();
    expect(sheep.fac).toBeTruthy();

    const cow = w.read('cattle_cow_encounter');
    expect(cow.guard).toBe(Str);
    expect(cow.handler).toBeTruthy();
    expect(cow.fac).toBeTruthy();
  })
  
  // const w0 = World
  //   .shape({
  //     ...ctx<{ a:number }>(),

  //     jerboa: {
  //       ...ctx<{ b:readonly number[], bb:number }>(),

  //       squeak: act(Num),
  //       burrow: act(456 as const),

  //       jump: {
  //         ...ctx<{ c:string }>(),

  //         quickly: act(789 as const),
  //         slovenly: act('boo' as const)
  //       }
  //     }
  //   })
  //   // .ctxImpl('', () => ({ a:1 }))
  //   // .ctxImpl('jerboa', x => ({ b:[0, x.a], bb:0 }))
  //   // .ctxImpl('jerboa_jump', () => ({ c:'hullo' }))
  //   .impl({
  //     jerboa: {
  //       async squeak(x, d) {
          
  //         x;
  //         return ['jerboa_squeak', d];
  //       },

  //       async burrow(x, d) {
  //         x; d
  //         return ['jerboa_jump_quickly', 789]
  //       },

  //       jump: {
  //         async slovenly(x, d) {
  //           x;
  //           console.log(`hello ${d}`);
  //           return ['jerboa_jump_quickly', 789];
  //         }
  //       }
  //     }
  //   });


  // type F<T> = 
  //   T extends infer TT ? TT : never;

  // type W = F<typeof world>;
  // const w0: W = world;

  // it('resolves handlers', () => {
  //   const w = w0.build();
    

    
  //   const r1 = w.read('jerboa_squeak');
  //   expect(r1.guard).toEqual([Num])
  //   expect(r1.handler).not.toBeUndefined();

  //   const r2 = w.read('jerboa_jump_quickly');
  //   expect(r2.guard).toEqual([789])
  //   expect(r2.handler).toBeUndefined();
  // })

  // it('resolves facs', () => {
  //   const w = w0.build();

  //   const r1 = w.read('jerboa_squeak');
  //   const x1 = r1.fac?.call({},{});
  //   expect(x1).toHaveProperty('a', 1);
  //   expect(x1).toHaveProperty('b', [0, 1]);
    
  //   const r2 = w.read('jerboa_jump_quickly');
  //   const x2 = r2.fac?.call({},{});
  //   expect(x2).toHaveProperty('a', 1);
  //   expect(x2).toHaveProperty('b', [0, 1]);
  //   expect(x2).toHaveProperty('c', 'hullo');
  // })

  // it('facs covariant only', () => {
  //   const b0 = World.shape({
  //     ...ctx<{a:1}>()
  //   });

  //   const b1 = b0.mergeWith(World.shape({
  //     ...ctx<{a:2}>()
  //   }));

  //   const _ = b1.build() as ['Unimplemented facs found', unknown];
  // })

  // it('combines node trees', () => {
  //   const w = w0.mergeWith(
  //     World.shape({
  //       jerboa: {
  //         ...ctx<{ z: 111 }>(),

  //         nibble: {
  //           ...ctx<{ z: 999, z0: number }>(),
  //           furtively: act(789 as const)
  //         },
  //       }
  //     }))
  //     .ctxImpl('jerboa', x => ({ z: 111 as const }))
  //     .ctxImpl('jerboa_nibble', x => ({ z: 999 as const, z0: x.z }))
  //     .build();

  //   w.nodes.D_jerboa_squeak,
  //   w.nodes.D_jerboa_nibble_furtively
  //   w.nodes.XI_jerboa_nibble

  //   const r0 = w.read('jerboa_squeak');
  //   expect(r0.guard).toEqual([Num]);

  //   const r1 = w.read('jerboa_nibble_furtively');
  //   expect(r1.guard).toEqual([789]);

  //   const x1 = r1.fac?.call({},{})
  //   expect(x1).toEqual({
  //     a: 1,
  //     b: [0, 1],
  //     bb: 0,
  //     z: 999,
  //     z0: 111    //problem here is that upstream z is never actually implemented!!!
  //   })
  // })

  // it('can expand facs', () => {
  //   const w1 = w0.mergeWith(
  //     World.shape({
  //       jerboa: {
  //         ...ctx<{ b: readonly [1,number] }>()
  //       }
  //     }));

  //   const w2 = w1
  //     .ctxImpl('jerboa', x => ({ b: [2, x.b[1]] }));
2
  //   const b = w2
  //     .build();

  //   const r0 = b.read('jerboa_squeak');
  //   const x0 = r0.fac?.call({}, {});

  //   expect(x0).toEqual({
  //     a: 1,
  //     b: [2, 1],
  //     bb: 0
  //   });
  // })
})


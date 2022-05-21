import { shape } from "../src/shape";
import { $Fac, $fac, data, fac } from "../src/shapeShared";
import { Num } from "../src/guards/Guard";

/* 
so we really want to be able to opt in to layers of facs
like ad hoc inheritance
but then also associate these to namespaces and individual handlers

association would be a two step thing then
we'd populate a dictionary of factories
and propogate lists of layers
that would have to be assigned by a separate call
but how they should be pinned to particular handlers is a porcelain concern

but what is a named fac but a typed function with a name?
we still return to the problem of associating with handlers
and how these associations work on merging of graphs if we're propagating associations
(which we do want to do as it simplifies loads)

we want to attach subtrees into greater trees, as long as those upper trees provide the same types
as these facs are just supplying, then I think we can do contravariance

the overall subtree is a thing with inputs and outputs
so once created, and before any typed merging is possible, we need to know the inputs and outputs
which we currently can't do: facs implicitly build on a single 'unknown'
and data shapes...?

data shapes can at least be specified and left unfilfilled
on merge we have to check that shapes can be merged (and these are invariant)

we need fac shapes then if we're having typed propagated contexts too
so: first question, how do we declare these?

part of the shape too? would make sense

-------------------------

but if they are, how do we fulfil them?
ignore doing inline: implementations can be provided at end
we know the declared facs from our nodes shape

though doing inline had the type inference thing which was nice...
maybe they could be specified inline as well, but this would require a bit more type magic
and specifying the types is what would really unblock us here
so let's do that

$facs can then be specified as part of normal impl calls

which gives us some nice typingsin our node type
and then merging logic is entirely to do with walking two Nodes, and making sure nothing resolves to 'never'

how does this work with the FacNodes?
we'd want placeholder FacNodes that could be happily merged as one
simple merging really: if two FacNodes exist at same path, they can only be merged if at least one of them is flagged abstract
and if they are merged, then their downstreams are just joined together

but a fac with no downstreams (ie no handlers hanging off them) is effectively abstract: nobody cares what it outputs
but the entire point of abstract facs is to hang off them before they are fully concretized

I'm wondering, do they even need to be merged?
maybe each path could actually have a list of FacNodes
merging is just a case of adding another node to the list
but then when it comes to assigning a fac impl, a single impl can be shared across nodes

but after merging, new downstream handlers would need to know which facs to take from? can't really take an endless list of identical outputs
so merging must put one fac on each path, at least going forward...
but, merges are biased in one direction, and overwriting is possible

so if two facs are concrete, one overwrites the other
but if one is abstract it gets merged into one
this works in types as well: concrete facs can just replace each other

though: overwriting is confusing, and can be productively sidestepped
we can instead disallow merges if the same things are in the same places
similarly typed or not; but if nodes are abstract, then they can be combined, with appropriate variance

handlers are abstract if there are no impls matching them
exactly the same as facs

how can this be enforced at the type level, if all this info is hidden away in the Registry?
it naturally can't be
problems only show up at runtime
we could add typelevel tracking of impls
or we could lean on default behaviour that makes sense everywhere, even if not perfect

default sensible behaviour:
if types are invariantly equal for data, or contravariantly compatible for facs, then they can be merged
at runtime, any conflicting impls throw errors (or simply overwrite, as the types are compatible if we've got this far)

overwriting is a nice mechanism, useful for extension
and this is why we introduced the FacNode mechanism of course, to support this
when overwriting a fac, we only overwrite for ourselves: whatever was there before is left in place
so types don't have to be enforced on merge

well, actually... merging of incompatibles is still possible
and is actually quite separate from overwriting

when merging, we don't reimplement for others
(as others have been written as self-consistent modules)

but in the case of abstract facs that's exactly what we're up to: it's what we need
and it's what we do with handlers

it seems fine to update facs from below, as long as we can fit the types programmed against
so in emplacing a new fac, we have to extend the output of the fac, though the input is a particular thing that only matters on implementation

this means that facs aren't to be captured on implementation
they are summoned JIT on dispatch
the network of facs is to support new facs rather than old handlers

----

so all facs must be declared as part of the shape
and they can be merged with covariance on their outputs from left to right
(ie new facs can only extend what was their before)

and data and handlers can be merged, albeit without variance

both handlers and facNodes simply replace each other (right always wins)

-----

the problem of abstract FacNodes still exists though:
FacNodes are constructed as their own world
*it's almost like FacNode resolution should be separated from the graph of nodes, which is implicit in the nodes structure*

-----

The problem of fac memoization

when providing a new fac in place of another, we build on the output of the existing occupant
the existing occupant can be supplied by whatever is newly upstream

this also means that any new facs anywhere in the graph can only extend what's already in place
which seems reasonable

why can't new facs just be composed with pre-existing ones?
something to do with memoization?
memoization isn't needed with lazy resolution

no need for facnodes then? yup
just need fac functions
*/

function fac<T>(): { [k in $Fac]: T } { throw 'unimpl' }

describe('shape', () => {

  it('simple nodes', () => {
    const w = shape({
      $: fac<number>(),

      rat: {
        $: fac<'yo'>(),

        squeak: data(Num)
      }
    });

    w.nodes
  })
  

  it('builds node map from tree', () => {
    const w = shape({
        $fac: fac<number>(),
      
        jerboa: {
          $fac: fac<123>(),

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


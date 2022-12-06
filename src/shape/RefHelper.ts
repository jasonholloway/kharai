import { Guard, Num, Read, Str } from "../guards/Guard";
import { Id } from "../lib";
import * as NodeTree from './NodeTree'
import * as RelPaths from './RelPaths'
import { IsNever, Simplify } from "../util";

export type Form<RDT> =
  _SquishNode<
    _PruneNode<
      _MapNode<Omit<RDT,'D'>
  >>>
;

type _MapNode<N> =
  N extends { D?:infer D, S?:infer S } ?
  { C: _MapDataNode<D>, S: Simplify<_MapSpaceNode<S>> }
  : never
;

type _MapDataNode<DTup> =
  DTup extends [infer D]
    ? _Creator<Read<D>>
    : never
;

type _MapSpaceNode<S> =
  { [k in keyof S]: _MapNode<S[k]> }
;


//********************************************************
//so, to flip this on its head
//default is never!
//the children need to convince us to include
//for which it only takes one
//a single normal node will therefore justify its entire route and subtree
//if we have nothing that can be proven to be stringworthy then
//all will be left in the air and unusable

//that is, we need a first pass that looks for a stringable node
//if its true, then we do our normal string mapping
//if false then we just don't include it
//if uncertain, then it's in the air and unusable
//but that is how it is...
//********************************************************

//so we know our node is a keeper - what do we do?
//if it's a keeper we include it in the tree
//


//need to go depth-first
//if a space node is { C:never, S:{} } we can prune it
type _PruneNode<N> =
  N extends { C: infer C, S: infer S } ?
  { C:C, S:Simplify<_PruneSpace<S>> }
  : never
;

type _PruneSpace<S> =
  {
    [
      K in keyof S
        as true extends _IsKeepable<S[K]> ? K : never
    ]: _PruneNode<S[K]>
  }
;

// the whole point of IsKeepable is to avoid deferring
// we want an up-front answer please regarding the purport of T
// but IsKeepable itself gets tangled with its generic checks
//
// as soon as the RHS has a generic in it, we're effed
// but the generic is exactly what we want to check?
// and we normally can check it
// but normally it's already been concretized
//
// in the case of the generic template
// it's not concretized though
// we can plop it here and there
// but we can't test it, and expect a nice semi-concrete shape...
//
// well, actually... we can
// because ts will still narrow as much as possible, up to the point
// of a generic condition
//
// the problem is the sqiushing
// we can leave leaf nodes as Creator<T>
// but we can't then exise bad leaves??
//
// maybe we could: instead of checking intently each one
// we could just keep ones that 
//
// wait a sec, another angle: the 'N' below is actually concrete
// the only unbound generic is the T of the data type...
// which only appears in the Creator<T>
// 
// could we somehow wrap the generic param?
// then we could detect the wrapper and just leave it alone
//
// ANOTHER IDEA
// we could pre-clean the tree, especially for RefHelper
// by chucking out generic type info
// if we encounter a wrapper
// then we just annihilate it
//
// Param(T) would wrap it as (Param<T> extends Param)
// we could then use this to clean it
//
// the issue is that we're at the limit here: we are victims of what ts allows
// and we can have no control over this
// a wrapper would let us choose
// things would mostly work without Param, as a slightly tolerable misusage
//
// so - we have to use a marker type 
// to avoid all references ofunbound params
// are unbound params useful for PhaseHelper? yes, yes they are
// but they can be mapped in directly
// the issue is here with RefHelper: we need to conditionally exclude them
// 
// what if this treatment were opt in - ie a special type other than string...
// we'd fall afoul of the same issue
// because we'd still need to check the type
//
// choices:
// 1. have all props available on RefHelper, with only the string ones actually usable
// 2. use another registry, instead of cheking the type up front: ie, mark a phase as specially summonable
//    - this is an extra layer on approach (1) - a sideband filter
//    - this *might* make generic params summonable, if the param extends string
// 3. wrap all generic params and ignore them for summoning
//    - the most elegant solution breaks down, a wrapper is a complicating shame
//    - and it also limits functionality: it means we simply can't use RefHelper for generic params
//
// SO CURRENT PLAN...
// is to register summoners as part of the tree
// which gives shape to the RefHelper aka SingletonReferrer
// and the to the SingletonSummoner
//
// can I imagine a future where the only ay to get a blessed Id is via the helper?
// this would mean we can't refer to anything unless it has an original type
// so we can't just refer to _anything_ - well I suppose we could, but we'd be disappointed in most cases
// or rather the happy path would be to always use the helper
// Id would then be a wrapped structure; and the helper would allow us to refer arbitrarily
//
// given an original type, then an object could promise to provide an interface, I suppose
// so certain interactions would become available to be pleasantly accessed
// I like this intent - a suggestion of usage, though with freedom to ignore it forwhatever reason (responses can always be deferred)
//
// The 'type' of machine would then suggest its bindability to an interface of usage
// ie its turning into COM!
//
// COM->DCOM though... how would we achieve the same?
// our storage guarantees would need to synchronise: ie the committing of one stage would be dependent on the storage of another
// we could flatten to a single node-specific log
// but this would be to throw away structure and parallelizability of saving
// I'mnot sure at this point if we even allow this now... when we save, we must save a particular lobe out of potentially many...
//
// So storage substrates would sync their saves 
// via Zookeeper or something
// we would want to sync on the granularity of an entire partition, rather than per-machine
// machines would always belong to a certain partition: the ownership of that partition would be assigned to particular nodes
// this is too far into the future though... (plus it'd be nice to restrict communications between partitions to some kind of queue)
//
// where was I? registration of 'S' nodes please
//


type _IsKeepable<N> =
  false extends IsNever<N> ? (
    N extends { C: infer C, S: infer S } ?
      true extends _IsKeepable<S[keyof S]> ? true
    // : false extends IsNever<C> ? true
    : false : false)
  : false 
;

// type _IsKeepable<N> =
//   false extends IsNever<N> ? (
//     N extends { C: infer C, S: infer S } ?
//       true extends _IsKeepable<S[keyof S]> ? true
//     // : false extends IsNever<C> ? true
//     : false : false)
//   : false 
// ;

type _SquishNode<N> =
  N extends { C: infer C, S: infer S } ?
    {} extends S ? C
  : IsNever<C> extends true ? Simplify<_SquishSpace<S>>
  : Simplify<_SquishSpace<S> & C>
  : never
;

type _SquishSpace<S> =
  { [k in keyof S]: _SquishNode<S[k]> }
;

// 
//
//
//
//
//




// export type Form<RDT> =
//   _Map<
//     Omit<RDT,'D'>
//   >;

// type _Map<RDT> =
//   RDT extends { D?:infer DTup, S?:infer S } ?

//   ((DTup extends [infer D]
//     ? _Creator<Read<D>>
//     : unknown)
//   & (S extends {}
//     ? {
//       // [k in keyof S as _NormalizeName<k>]: _Map<S[k]>
//       [
//         Tup in
//           keyof S extends infer K ?
//           K extends keyof S ?
//           K extends string ?
//           [K]
//           // _Map<S[K]> extends infer V ?
//           // [K, V]
//           // unknown extends V ? never
//           // : [K, V]
//           : never : never : never //: never
//         as _NormalizeName<Tup[0]>
//       ]: _Map<S[Tup[0]]> //Tup[1]
//     }
//     : unknown))
  
//   : never
// ;

type _Creator<V> = 
  IsNever<V> extends true ? (() => Id)
  : V extends string ? ((d: V) => Id)
  : never
;

type _NormalizeName<S> =
  S extends `*${infer S2}` ? S2
  : S
;

try {
  type W = {
    D_M: [1]
    D_M_hello_again: [typeof Num]
    D_M_hello_moo: typeof Str
    D_M_tara: [4]
    D_M_tara_moo: never
  };

  type A = NodeTree.Form<W>;
  type B = RelPaths.Form<A,['tara']>
  type C = _MapNode<B>
  type G = _PruneNode<C>

  type E = _IsKeepable<{ C:{}, S:{}}>
  type F = _IsKeepable<{ C:never, S:{}}>
  type H = _IsKeepable<never>
  type D = Form<B>;

  const d = <D><unknown>undefined;
  d.hello.moo('123')
  d.tara.moo();
  d.moo();

  type _ = [A,B,C,D,E,F,G,H];
}
catch {}

try {
  type W = {
    D_M_a_oink: [typeof Num]
    D_M_a_moo: typeof Str
  };

  type A = NodeTree.Form<W>;
  type B = RelPaths.Form<A,[]>
  type C = _MapNode<B>
  type F = _IsKeepable<C>
  
  type D = _PruneNode<C>
  type E = _SquishNode<D>

  const e = <E><unknown>undefined;
  e.a.moo('123')

  type _ = [A,B,C,D,E,F];
}
catch {}

try {
  <T,S extends string>() => {
    type W = {
      D_M_hello_yep: Guard<S>
      D_M_hello_nope: Guard<T>
      D_M_hello_nah: typeof Num
      D_M_mmm: string
      D_M_mmm_yip: string
      D_M_mmm_yup: typeof Str
      D_M_mmm_nip: never
    }
    type N = NodeTree.Form<W>;
    type R = RelPaths.Form<N,['mmm']>;
    type Z = Form<R>

    const c = <Z><unknown>undefined;
    c.mmm('');
    c.mmm.nip();
    c.hello.yep(<S><unknown>undefined)
    c.hello.nope(<T><unknown>undefined)

    //RefHelper in particular can't cope with generics
    //!!!

    type _ = Z
  }
}
catch {}

try {
  <T,S extends string>() => {
    type W = {
      D_M_yup: string
      D_M_nope: Guard<T>
    }
    type A = NodeTree.Form<W>;
    type B = RelPaths.Form<A,[]>;
    type C = _MapNode<B>
    type D = _PruneNode<C>
    type E = _SquishNode<D>

    type F = _IsKeepable<C>

    type Z = _PruneSpace<{
      a: {
        C:never,
        S:{
          aa: {
            C:()=>999,
            S:{}
          }
          ab: {
            C:_Creator<T>,
            S:{}
          }
        }
      },
    }>

    const e = <E><unknown>undefined;
    e.a.yup('moo')
    e.a.nope(<T><unknown>undefined)

    type _ = [A,B,C,D,E,F,Z]
  }
}
catch {}

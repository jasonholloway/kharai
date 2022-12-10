import { FacNode } from "../facs";
import { Any, Guard, Narrowable, ReadExpand } from "../guards/Guard";
import { MachineCtx, PathCtx } from "../MachineSpace";
import { Handler, $Self, Fac, $data, $space, $handler, $fac, $Fac, $incl, $Incl, $root } from "../shapeShared";
import { Merge } from "../util";
import { Builder } from "./World";
import * as Impls from './Impls'
import * as NodeTree from './NodeTree'

export const separator = '_'
export type Separator = typeof separator;

export function formPath(pl: readonly string[]) {
  return pl.join(separator);
}

export type MachineTree<N> =
  {
    [
      Found in
        keyof N extends infer K ?
        K extends _JoinPaths<infer Prefix, infer Rest> ?
        Rest extends 'M'
        ? [K, Prefix]
        : Rest extends _JoinPaths<'M', infer Path> ?
          [K, _JoinPaths<Prefix, Path>]
        : never : never : never
      as Found[1]
    ]: N[Found[0]]
  }
;


export type NodePath<N> = _ExtractPath<'S'|'D', keyof N> | ''
export type DataPath<N> = _ExtractPath<'D', keyof N>
export type FacPath<N> = _ExtractPath<_JoinPaths<'XA','M'>, keyof N>

type _ExtractPath<A extends string, K> =
    K extends A ? ''
  : K extends `${A}${Separator}${infer P}` ? P
  : never


export type Data<N> =
  _Data<N, _Data<N>>
;

export type _Data<N, Inner = unknown> =
  keyof N extends infer K ?
  K extends `D${Separator}${infer P}` ?
  K extends keyof N ?
  _DataTuple<P, ReadExpand<N[K], $Self, Inner>>
  : never : never : never
;

type _DataTuple<P, D> =
  IsNotNever<D> extends true ? [P, D] : [P]
;


{
  type N = {
    D_M_rat: 123
    R_M_rat: true
    D_M_guineapig: ['hello', 123]
  };
  
  type A = Data<N>;
  type B = Data<{}>;

  type _ = [A,B];
}


export type ReadResult = {
  guard?: any,
  handler?: Handler,
  fac?: Fac
}







// {
//   type W = {
//     // XA: { a:1 },
//     D_M: 0,
//     // D_M_dog_woof: never,
//     // D_M_dog_woof: 123,
//     // S_M: true
//     // S_M_dog: true
//     // S_M_dog_woof: true
//     D_M_dog_woof_yip: 999,
//     // D_M_rat_squeak: 123,
//     XA_M_dog: { b:2 },
//     // D_cat_meeow: 456
//   };
    
//   type A = _ImplSplit<W>
//   type B = _ImplCombine<[A], {}, 'DOne', 'DAll',{},'O'>
//   type C = Impls<W,'O'>

//   const c: C = <C><unknown>{};
//   c


//   type _ = [A, B, C]
// }

{
  type N = {
    D_M_hamster_squeak_quietly: 123
    D_M_hamster_bite: 456,
  }

  type T = NodeTree.Form<N>

  type A = NodePath<N>
  type B = DataPath<N>
  type I = Impls.Form<T,'O'>

  const i:I = {
    hamster: {
      squeak: {
        async quietly(x, d) {
          throw 123;
        }
      }
    }
  };

  type _ = [A,B,I]
  i


  function fn<T>() {
    type N1 = {
      D_M_blah: Guard<T>
    };

    type T1 = NodeTree.Form<N1>

    type A = Impls.Form<T1,123>;
    type B = Data<N1>

    const a: A = {};
    a


    type N2 = {
      D_moo: 999
    };

    type T2 = NodeTree.Form<N2>

    type C = Impls.Form<T2,123>;


    type Z = T;

    type _ = [A,B,C,Z];
  }
  
}

export type PathFac<N, P extends string> =
  _JoinPaths<'M', P> extends infer MP ?
  MP extends string ?
  _JoinPaths<'XA', MP> extends infer XP ?
  XP extends keyof N ?
    N[XP]
  : never : never : never : never
;

// below is used for ctx() amongst machines
// so - does it always have id, etc? yep it does
// but that should be picked up from tree
//
// so would just use the same?
// no, it wouldn't, because ctxs get to use previously implemented facs apparently
// 
// so - next question is, what does the below do with XIs that's specail??
// well, the code's there mate...
// so what it does is... it adds the context currently declared at the current node
// though this should be the case for actions too, yeah?
// yes, it should
//
// but here the behaviour is slightly different from what you'd expect:
// it ignores XAs (which we'd usually use, to only pick out XIs)
// so if we haven't implemented, then we can't extend???
//
// because we are in the middle of forming the XIs, we can't rely on something later coming along and fulfilling an XA which we ourselves are fulfilling
// the whole XA/XI thing is overcomplicated actually
// it'd be nice if we just added X's via ctx()
//
// let's try and think of a case for XA/XI
// guessing we were driven before by the common lot, which could only actually be provided after?
// but - how about a data layer, pluggable only at the end?
//
// hmmm seems both useful and unnecessarily complicating
// simpler would be some kind of DI as a separate layer
// but wouldn't this itself be best as part of the NodeTree to limit the scopes of things?
// I think it would
//
// and so we'd have different implementations for different subtrees (sounds nice)
// but: this isn't actually possible with XA/XI, as the implementation must at each point
// be locally provided there and then
//
// the use case must have been the builtins...
// encouraged too by the thought of specifying as part of the shape
// which we've done away with for reasons
//
// ctx wouldn't often be used
// how would the DI be used then?
// each node would have its dependencies accumulated as part of the tree
// and seal would consolidate them, restate them as part of a single, embeddable node
//
// these would then be provided at nodes
// and on build we would check that all are provided for
// this would provide another way to modularise:
// a template would be used, along with some new dependencies
// providing an implementation would bind it to the dependency, which would then disappear from the graph
//
// so the upshot of this is, we can just do away with XA/XIs, in favour of Xs
// a context would always be whatever the accumulated X is then
//

export type FacContext<NT, N, P extends string, O> =
  _JoinPaths<'M', P> extends infer MP ?
  MP extends string ?
  Merge<
    MachineCtx<NT, [], O>, //???
    Merge<
      _PathContextMerge<N, _UpstreamFacPaths<N, MP>>,
      (
        _JoinPaths<'XI', MP> extends infer XIP ?
        XIP extends keyof N ?
          N[XIP]
          : {}
        : never
      )
    >
  >
  : never : never
;

  

type _PathContextMerge<N, PL> =
    PL extends readonly [] ? {}
  : PL extends readonly [infer H, ...infer T] ? (
      H extends keyof N ?
      Merge<N[H], _PathContextMerge<N, T>>
      : never
    )
  : never;


type _UpstreamFacPaths<N, P extends string> =
  _JoinPaths<'XA', P> extends infer XP ?
  XP extends string ?
  // _KnownRoutePaths<N, XP> extends infer Route ?
  TupExclude<_KnownRoutePaths<N, XP>, XP> extends infer Route ?
    Route
  : never : never : never;

type _KnownRoutePaths<N, P extends string> =
  _AllRoutePaths<P> extends infer AS ?
  TupExtract<AS, keyof N> extends infer S ?
    S
  : never : never;

type _AllRoutePaths<P extends string, Path extends string = ''> =
  P extends `${infer Head}${Separator}${infer Tail}`
  ? readonly [..._AllRoutePaths<Head, Path>, ..._AllRoutePaths<Tail, _JoinPaths<Path, Head>>]
  : readonly [_JoinPaths<Path, P>];


type _JoinPaths<H extends string, T extends string> =
  H extends '' ? T
  : T extends '' ? H
  : `${H}${Separator}${T}`;


{
  type NN = {
    XA_M: { a: 1 }
    XA_M_rat: { b: 2 },
    D_M_rat_squeak_quietly: 999,
    XA_M_rat_squeak_quietly: { c: 3 },
    D_M_rat_squeak_quietly_blah: 999,
  }

  type TT = NodeTree.Form<NN>

  type A = FacPath<NN>

  type B = _AllRoutePaths<'XA'>
  type C = _AllRoutePaths<'XA_rat'>
  type D = _AllRoutePaths<'XA_rat_squeak_quietly_blah'>

  type E = _KnownRoutePaths<NN, 'XA'>
  type F = _KnownRoutePaths<NN, 'XA_rat'>
  type G = _KnownRoutePaths<NN, 'XA_rat_squeak_quietly_blah'>

  type H = _UpstreamFacPaths<NN, ''>
  type I = _UpstreamFacPaths<NN, 'rat'>
  type J = _UpstreamFacPaths<NN, 'rat_squeak_quietly'>
  type K = _UpstreamFacPaths<NN, 'rat_squeak_quietly_blah'>

  type L = FacContext<TT, NN, 'M_rat', 0>
  type M = FacContext<TT, NN, 'M_rat_squeak_quietly', 0>
  type N = FacContext<TT, NN, 'M_rat_squeak_quietly_blah', 0>

  type _ = [A, B, C, D, E, F, G, H, I, J, K, L, M, N];
}



export type Except<A, B> =
  A extends B ? never : A;

{
  type A = 1 | 2 | 3 | 4;
  type B = 3 | 2;
  type C = Except<A,B>

  type _ = [A,B,C]
}


export type Intersects<A, B> =
  [A & B] extends [never] ? false : true;




type AllButLast<R extends readonly any[]> =
    R extends readonly [] ? []
  : R extends readonly [any] ? []
  : R extends readonly [infer H, ...infer T] ? [H, ...AllButLast<T>]
  : R extends readonly (infer E)[] ? readonly E[]
  : never;

function allButLast<R extends readonly any[]>(r: R): AllButLast<R> {
  let ac = [];
  for(let i = 0; i < r.length - 1; i++) ac.push(r[i]) 
  return <AllButLast<R>><unknown>ac;
}

{
  type A = AllButLast<readonly [1, 2, 3]>;
  type B = AllButLast<readonly []>;
  type C = AllButLast<readonly [1]>;
  type D = AllButLast<number[]>;
  type _ = [A, B, C, D]

  const a = allButLast([1, 2, 3] as const);
}



type Head<R extends readonly unknown[]> =
    R extends readonly [] ? never
  : R extends readonly [infer H, ...any] ? H
  : never;

type Tail<R extends readonly any[]> =
    R extends readonly [] ? never
  : R extends readonly [any, ...infer T] ? Readonly<T>
  : R extends readonly [any] ? never
  : R extends readonly (infer E)[] ? readonly E[]
  : never;

export function head<R extends readonly any[]>(r: R): Head<R> {
  return <Head<R>>r[0];
}

export function tail<R extends readonly any[]>(r: R): Tail<R> {
  const [_, ...t] = r;
  return <Tail<R>><unknown>t;
}



type TupExtract<R, Filter> =
    R extends readonly [] ? readonly []
  : R extends readonly [infer H, ...infer T] ? (
    H extends Filter ? readonly [H, ...TupExtract<T, Filter>] : TupExtract<T, Filter>
  )
  : never;

type TupExclude<R, Filter> =
    R extends readonly [] ? readonly []
  : R extends readonly [infer H, ...infer T] ? (
    H extends Filter ? TupExclude<T, Filter> : readonly [H, ...TupExclude<T, Filter>]
  )
  : never;

{
  type A = TupExtract<[], 1>
  type B = TupExtract<[1], 1>
  type C = TupExtract<[1], 0>
  type D = TupExtract<[1, 2, 3], 1|3>
  type _ = [A, B, C, D]
}



type PathList<PS extends string> =
    PS extends '' ? []
  : PS extends `${infer PHead}${Separator}${infer PTail}` ? [PHead, ...PathList<PTail>]
  : [PS];



type TupPopHead<L> =
    L extends [] ? [[], false]
  : L extends [infer H, ...infer T] ? [T, true, H]
  : never;

{
  type A = TupPopHead<[]>
  type B = TupPopHead<[1]>
  type C = TupPopHead<[1, 2, 3]>

  type _ = [A, B, C]
}


type IsNotNever<T> =
  [T] extends [never] ? false : true;




export type SchemaNode = DataNode<unknown> | RootNode<unknown> | object
export type DataNode<D> = { [$data]: D }
export type RootNode<D> = DataNode<D> & { [$root]: true }
export type InclNode = { [$incl]: Builder<{}> }
export type SpaceNode<I> = { [$space]: I }
export type HandlerNode = { [$handler]: Handler }
export type ContextNode<X = unknown> = { [$fac]: FacNode<X> }

export function act<S extends Narrowable = never>(s?: S): DataNode<S> { //   unknown extends S ? never : S> {
  return { [$data]: <S><unknown>(s === undefined ? Any : s) };
}

export function root<S extends Narrowable>(s: S): RootNode<S> { //   unknown extends S ? never : S> {
  return { [$data]: <S><unknown>(s === undefined ? Any : s), [$root]: true };
}

export function space<S extends { [k in keyof S]: SchemaNode }>(s: S): SpaceNode<S> {
  return { [$space]: s };
}

export function ctx<T>(): { [k in $Fac]: T } {
  return { [$fac]: <T><unknown>'FAC' };
}

export function incl<W>(w: W): { [k in $Incl]: W } {
  return { [$incl]: w };
}

export function isDataNode(v:unknown): v is DataNode<unknown> {
  return !!(<any>v)[$data];
}

export function isInclNode(v:unknown): v is InclNode {
  return !!(<any>v)[$incl];
}


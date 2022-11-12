import { FacNode } from "../facs";
import { Any, Guard, Narrowable, ReadExpand } from "../guards/Guard";
import { PathCtx, MachineCtx } from "../MachineSpace";
import { Handler, $Root, Fac, $data, $space, $handler, $fac, $Fac, $incl, $Incl } from "../shapeShared";
import { Merge, Simplify } from "../util";
import { Builder } from "./World";

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
  // MachineTree<N> extends infer M ?
  // _Data<M, _Data<M>>
  // : never

type _Data<N, Inner = unknown> =
  keyof N extends infer K ?
  K extends `D${Separator}${infer P}` ?
  K extends keyof N ?
  _DataTuple<P, ReadExpand<N[K], $Root, Inner>>
  : never : never : never
;

type _DataTuple<P, D> =
  IsNotNever<D> extends true ? [P, D] : [P]
;


{
  type A = Data<{
    XA: MachineCtx<A,'O'>
    XI: MachineCtx<A,'O'>
    D_rat: 123
    D_guineapig: ['hello', 123]
  }>;

  type B = Data<{}>;

  type _ = [A,B];
}


export type ReadResult = {
  guard?: any,
  handler?: Handler,
  fac?: Fac
}


export module Impls {

  export type Form<N, O> =
    (_Form<N, _Data<N>, O> & { M:unknown })['M'] extends infer I ?
    I extends undefined ? never
    : I
    : never
  ;

  type _Form<N, DOne, O> =
    [_Split<N>] extends [infer Tups] ?
    _Combine<[Tups], {}, DOne, _Data<N, DOne>, MachineCtx<N,O>, O>
    : never
  ;

  type _Split<N> =
    keyof N extends infer K ?
    K extends keyof N ?
    K extends string ?
    TupPopHead<PathList<K>> extends [infer Path, infer Popped, infer Type] ?
    Popped extends true ?
    readonly [Type, Path, N[K]]
    : never : never : never : never : never
  ;

  type _Combine<Tups, X0, DOne, DAll, XExtra, O> =
    Simplify<(
      (
        [
          Tups extends readonly [infer I] ?
            I extends readonly ['XA', [], infer V] ? V
          : never : never
        ] extends readonly [infer X1] ?
        IsNotNever<X1> extends true ? Merge<X0, X1> : X0
        : never
      )
      & XExtra
    )> extends infer X ?

    (
      [
        Tups extends readonly [infer I] ?
          I extends readonly ['D', [], infer V] ? [V]
        : never : never
      ] extends readonly [infer DD] ?
        IsNotNever<DD> extends true ?
        DD extends readonly [infer D] ?
          _Phase<D, X, O>
          : never : unknown
      : unknown
    ) &
    (
      {
        [Next in
          Tups extends readonly [infer I] ?
          I extends readonly [infer Type2, readonly [infer PH, ...infer PT], infer V] ?
          PH extends string ?
          readonly [PH, readonly [Type2, PT, V]]
          : never : never : never
        as Next[0]
        ]?: _Combine<[Next[1]], X, DOne, DAll, XExtra, O>
      }
    )

    : never
  ;

  type _Phase<D, X, O> =
    _Handler<D,X,O> | { act:_Handler<D,X,O>, show?: (d:ReadExpand<D,$Root,O>)=>unknown[] }
  ;

  type _Handler<D, X, O> = 
    (x:X, d:ReadExpand<D,$Root,O>)=>Promise<O|false>
  ;

  {
    type W = {
      // XA: { a:1 },
      D_M: 0,
      // D_M_dog_woof: never,
      // D_M_dog_woof: 123,
      // S_M: true
      // S_M_dog: true
      // S_M_dog_woof: true
      D_M_dog_woof_yip: 999,
      // D_M_rat_squeak: 123,
      XA_M_dog: { b:2 },
      // D_cat_meeow: 456
    };

    type A = _Split<W>
    type B = _Combine<[A], {}, 'DOne', 'DAll',{},'O'>
    type C = Form<W,'O'>

    const c: C = <C><unknown>{};
    c


    type _ = [A, B, C]
  }
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

  type A = NodePath<N>
  type B = DataPath<N>
  type I = Impls.Form<N,'O'>

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
      D_blah: Guard<T>
    };

    type A = Impls.Form<N1, 123>;
    type B = Data<N1>

    const a: A = {};
    a


    type N2 = {
      D_moo: 999
    };

    type C = Impls.Form<N2, 123>;


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


export type FacContext<N, P extends string, O> =
  _JoinPaths<'M', P> extends infer MP ?
  MP extends string ?
  Merge<
    PathCtx<N, O>,
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
    XA: { a: 1 }
    S: true,
    XA_rat: { b: 2 },
    S_rat: true,
    S_rat_squeak: true
    D_rat_squeak_quietly: 999,
    XA_rat_squeak_quietly: { c: 3 },
    S_rat_squeak_quietly: true,
    D_rat_squeak_quietly_blah: 999,
  }

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

  type L = FacContext<NN, 'rat', 0>
  type M = FacContext<NN, 'rat_squeak_quietly', 0>
  type N = FacContext<NN, 'rat_squeak_quietly_blah', 0>

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




export type SchemaNode = DataNode<unknown> | object
export type DataNode<D> = { [$data]: D }
export type InclNode = { [$incl]: Builder<{}> }
export type SpaceNode<I> = { [$space]: I }
export type HandlerNode = { [$handler]: Handler }
export type ContextNode<X = unknown> = { [$fac]: FacNode<X> }

export function act<S extends Narrowable = never>(s?: S): DataNode<S> { //   unknown extends S ? never : S> {
  return { [$data]: <S><unknown>(s === undefined ? Any : s) };
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


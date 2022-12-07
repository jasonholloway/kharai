import { Merge, Simplify } from "../util";
import { IsNotNever, PathList, TupPopHead } from "./World";

export type Form<N> =
  [_Split<N>] extends [infer Tups] ?
  _Combine<[Tups], {}>
  : never
;

export type Extract<N,PL> =
  PL extends [] ? N
  : PL extends [infer PH, ...infer PT] ?
    N extends { S: { [k in PH & string]: infer N2 } } ? Extract<N2, PT>
  : never : never
;

type _Split<N> =
  keyof N extends infer K ?
  K extends keyof N ?
  K extends string ?
  TupPopHead<PathList<K>> extends readonly [infer Popped, readonly [infer Type, infer Path]] ?
  Popped extends true ?
  readonly [Type, Path, N[K]]
  : never : never : never : never : never
;

type _Combine<Tups, X0> =
  Simplify<(
    [
      Tups extends readonly [infer I] ?
        I extends readonly ['XA', [], infer V] ? V
      : never : never
    ] extends readonly [infer X1] ?
    IsNotNever<X1> extends true ? Merge<X0, X1> : X0
    : never
  )> extends infer X ?

  [(
    [
      Tups extends readonly [infer I] ?
        I extends readonly ['D', [], infer V] ? [V]
      : never : never
    ] extends readonly [infer DD] ?
      IsNotNever<DD> extends true ?
      DD extends readonly [infer D] ?
      { P: [X,D] }
      : never : unknown
    : unknown
  )] extends [infer PhasePart] ?

  
  [
    ['R', [], true] extends Tups[keyof Tups]
      ? { R:true }
      : {}
  ] extends [infer RootPart] ?

  (
    {
      [Next in
        Tups extends readonly [infer I] ?
        I extends readonly [infer Type2, readonly [infer PH, ...infer PT], infer V] ?
        PH extends string ?
        readonly [PH, readonly [Type2, PT, V]]
        : never : never : never
      as Next[0]
      ]: _Combine<[Next[1]], X>
    } extends infer Space ?
    {} extends Space ? unknown :
    { S: Space }
    : never
  ) extends infer SpacePart ?

  Merge<Merge<PhasePart, RootPart>, SpacePart>

  : never : never : never : never
;

try {
  type W = {
    XA: { i: 123, j: 456 },
    // D_M: [1]
    XA_M_tara: { i: 789 },
    // // D_M_hello_again: [typeof Num]
    // D_M_hello_moo: never
    D_M_tara: [4]
    D_M_tara_moo: never
    R_M_tara_moo: true
  };

  type A = _Split<W>;

  type B = Form<W>;
  type C = Extract<B, ['M','tara']>

  type _ = [A,B,C];
}
catch {}

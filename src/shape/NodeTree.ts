import { Merge } from "../util";
import { IsNotNever, PathList, TupPopHead } from "./World";

export type Form<N> =
  [_Split<N>] extends [infer Tups] ?
  _Combine<[Tups]>
  : never
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

// todo: below could work generically across all possible keys
// (with special rule for 'S')
type _Combine<Tups> =
  (
    [
      Tups extends readonly [infer I] ?
        I extends readonly ['X', [], infer X] ? X
      : never : never
    ] extends readonly [infer X] ?
      IsNotNever<X> extends true ?
        { X: X }
        : unknown
    : never
  ) extends infer XPart ?

  [(
    [
      Tups extends readonly [infer I] ?
        I extends readonly ['D', [], infer V] ? [V]
      : never : never
    ] extends readonly [infer DD] ?
      IsNotNever<DD> extends true ?
      DD extends readonly [infer D] ?
      { D:D }
      : never : unknown
    : unknown
  )] extends [infer DPart] ?
  
  [
    ['R', [], true] extends Tups[keyof Tups]
      ? { R:true }
      : {}
  ] extends [infer RPart] ?

  (
    {
      [Next in
        Tups extends readonly [infer I] ?
        I extends readonly [infer Type2, readonly [infer PH, ...infer PT], infer V] ?
        PH extends string ?
        readonly [PH, readonly [Type2, PT, V]]
        : never : never : never
      as Next[0]
      ]: _Combine<[Next[1]]>
    } extends infer Space ?
    {} extends Space ? unknown :
    { S: Space }
    : never
  ) extends infer SPart ?

  Merge<XPart,Merge<Merge<DPart, RPart>, SPart>>

  : never : never : never : never
;

export type Extract<N,PL,XAC=unknown> =
  Merge<
    XAC,
    (N extends { X: infer NX } ? NX : unknown)
    > extends infer X ?
  PL extends [] ? Merge<N, { X: X }>
  : (
    PL extends [infer PLH, ...infer PLT] ?
    N extends { S: { [k in PLH & string]: infer N2 } } ?
    Extract<N2, PLT, X>
    : never : never
  ) : never
;


try {
  type W = {
    X: { i: 123, j: 456 },
    // D_M: [1]
    X_M_tara: { i: 789 },
    // // D_M_hello_again: [typeof Num]
    // D_M_hello_moo: never
    D_M_tara: 4
    D_M_tara_moo: never
    R_M_tara_moo: true
  };

  type A = _Split<W>;

  type B = Form<W>;
  type C = Extract<B, ['M']>

  type _ = [A,B,C];
}
catch {}

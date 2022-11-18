import { Merge, Simplify } from "../util";
import { IsNotNever, PathList, TupPopHead } from "./World";

export type Form<N> =
  [_Split<N>] extends [infer Tups] ?
  _Combine<[Tups], {}>
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

  Merge<(
    [
      Tups extends readonly [infer I] ?
        I extends readonly ['D', [], infer V] ? [V]
      : never : never
    ] extends readonly [infer DD] ?
      IsNotNever<DD> extends true ?
      DD extends readonly [infer D] ?
        { X:X, D:D } //  { _: readonly [X,D] } // X:X, D:D }
        : never : unknown
    : unknown
  ),
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
    }
  )>

  : never
;

try {
  type W = {
    XA: { i: 123 },
    D_M: [1]
    XA_M_tara: { i: 999 },
    // D_M_hello_again: [typeof Num]
    D_M_hello_moo: [3]
    D_M_tara: [4]
    // D_M_tara_moo: never
  };

  type A = Form<W>;

  type _ = [A];
}
catch {}

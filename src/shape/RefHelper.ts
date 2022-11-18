import { Num, Read, Str } from "../guards/Guard";
import { Id } from "../lib";
import { IsNever } from "../util";
import { IsNotNever, JoinPaths } from "./World";

export type Form<N> = WalkData<'M', ExtractData<N>>

type WalkData<P extends string, D> = //DeepSimplify<
  (
    P extends keyof D
      ? Creator<Read<D[P]>>
      : never
  ) extends infer Curr ?
  (
    [ExtractNextPrefixes<P,D>] extends [infer NPS] ?
    IsNever<NPS> extends false ? {
      [
        T in (
          NPS extends infer NP ?
          NP extends string ?
          [NP,WalkData<JoinPaths<P,NP>, D>]
          : never : never
        ) as (
          IsNever<T[1]> extends false ? T[0] : never
        )
      ]: T[1]
    }
    : never : never
  ) extends infer Inner ?
  (
    [IsNever<Curr>, IsNever<Inner>] extends infer S ?
        S extends [false, false] ? (Curr & Inner)
      : S extends [true, false] ? Inner
      : S extends [false, true] ? Curr
    : never : never
  )
  : never : never
// >
;

type ExtractNextPrefixes<P extends string, D> =
  keyof D extends infer K ?
  K extends JoinPaths<P, JoinPaths<infer N, any>> ?
  N
  : never : never;

type ExtractData<N> = {
  [k in keyof N as (k extends JoinPaths<'D', infer P> ? P : never)]: N[k]
};

type Creator<V> = 
  IsNotNever<V> extends false
  ? (() => Id)
  : (
    V extends string ?
      ((d: V) => Id)
      : never
  )
;

try {
  type W = {
    D_M: [1]
    D_M_hello_again: [typeof Num]
    D_M_hello_moo: typeof Str
    D_M_tara: [4]
    D_M_tara_moo: never
  };

  type A = ExtractData<W>;
  type B = ExtractNextPrefixes<'', A>
  type C = ExtractNextPrefixes<'M', A>
  type Z = Form<W>

  const z = <Z><unknown>undefined;
  z.hello.moo('123')

  // z.hello.again([2]);
  // z.tara([4]);
  // z.tara.moo();

  type _ = [A,B,C,Z];
}
catch {}

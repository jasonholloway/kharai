import { Num, ReadExpand } from "../guards/Guard";
import { $Root } from "../shapeShared";
import { DeepSimplify, IsNever, Simplify } from "../util";
import { Data } from "./common";
import { IsNotNever, JoinPaths } from "./World";
import * as NodeTree from './NodeTree'

export type Form<N, Out> =
  Simplify<WalkData<'', ExtractData<N>, Data<N>, Out> & { skip: () => Out }>
;

type ExtractData<N> = {
  [k in keyof N as (k extends JoinPaths<JoinPaths<'D','M'|'*'>, infer P> ? P : never)]: N[k]
};

type WalkData<P extends string, D, DAll, Out> = DeepSimplify<
  (
    P extends keyof D
      ? Handler<ReadExpand<D[P], $Root, Out>, Out>
      : unknown
  )
  & (
    [ExtractNextPrefixes<P,D>] extends [infer NPS] ?
    IsNever<NPS> extends false ? 
      {
        [N in ExtractNextPrefixes<P,D> & string]: WalkData<JoinPaths<P,N>, D, DAll, Out>
      }
    : unknown : never)
>;

type Handler<V,Out> =
  IsNotNever<V> extends true
  ? ((d: V) => Out)
  : (() => Out);

type ExtractNextPrefixes<P extends string, D> =
  keyof D extends infer K ?
  K extends JoinPaths<P, JoinPaths<infer N, any>> ?
  N
  : never : never;


try {
  type N = {
    D_M: [1]
    D_M_hello_again: [typeof Num]
    D_M_hello_moo: [3]
    D_M_tara: [4]
    D_M_tara_moo: never
  };

  type T = NodeTree.Form<N>;

  type A = ExtractData<N>;
  type B = ExtractNextPrefixes<'', A>
  type C = ExtractNextPrefixes<'hello', A>

  type Z = WalkData<'',A,'DAll','OUT'>

  const z = <Z><unknown>undefined;

  // z.hello.again([2]);
  z.tara([4]);
  // z.tara.moo();

  type _ = [A,B,C,Z];
}
catch {}

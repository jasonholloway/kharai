import { Extend, Simplify } from "../util";
import * as NodeTree from './NodeTree'

export type Form<N, PL extends string[]> =
  Simplify<_Form<N,PL,unknown>>
  ;

type _Form<N, PL extends string[], XA> =
  (N extends { X: infer X } ? X : unknown) extends infer NX ?
  Extend<XA,NX> extends infer X ?
    PL extends [] ? X
  : PL extends [infer PLH, ...infer PLT] ? (
      N extends { S: infer S } ? 
      PLH extends keyof S ?
      PLT extends string[] ? 
        _Form<S[PLH], PLT, X>
      : never : unknown : never
  )
  : never : never : never
;

try {
  type W = {
    X: {a:1}
    X_M: {b:2}
    X_M_blah: {c:3}
  }

  type A = NodeTree.Form<W>;
  type B = Form<A,[]>
  type C = Form<A,['M','blah']>
  type D = Form<A,['C']>

  type _ = [A,B,C,D]
} catch {}

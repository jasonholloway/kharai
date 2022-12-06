import { Guard, Num, ReadExpand } from "../guards/Guard";
import { $Self } from "../shapeShared";
import { DeepMerge } from "../util";
import { IsNotNever } from "./World";
import * as NodeTree from './NodeTree'
import * as RelPaths from './RelPaths'

export type Form<RDT,Out> =
  _Map<
    DeepMerge<Omit<RDT,'D'>, { S: { skip: { D: [never] } } }>,
    Out
  >;

type _Map<RDT, O> =
  RDT extends { D?:infer DTup, S?:infer S } ?

  (DTup extends [infer D]
    ? _Handler<ReadExpand<D,$Self,O>,O>
    : unknown)
  & (S extends {}
    ? { [k in keyof S as _NormalizeName<k>]: _Map<S[k],O> }
    : unknown)
  
  : never
;

type _Handler<V,Out> =
  IsNotNever<V> extends true
  ? ((d: V) => Out)
  : (() => Out);

type _NormalizeName<S> =
  S extends `*${infer S2}` ? S2
  : S
;

try {
  type N = {
    D_M: 1
    D_M_hello_again: typeof Num
    'D_M_hello_*moo': 3
    D_M_tara: [4]
    D_M_tara_moo: never
  };

  type A = NodeTree.Form<N>;
  type B = RelPaths.Form<A,['tara']>;
  type C = Form<B,'OUT'>;

  const c = <C><unknown>undefined;
  c.skip();
  c.moo();
  c.hello.moo(3);

  type _ = [A,B,C];
}
catch {}

try {
  <T>() => {
    type W = {
      D_M_yo_hi: Guard<T>
      D_M_moo: 123
    }
    type N = NodeTree.Form<W>;
    type R = RelPaths.Form<N,[]>;
    type Z = Form<R,'O'>

    type _ = Z
  }
}
catch {}

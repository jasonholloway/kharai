import { Guard, Num, ReadExpand } from "../guards/Guard";
import { $Self } from "../shapeShared";
import { IsNotNever } from "./World";
import * as NodeTree from './NodeTree'
import * as RelPaths from './RelPaths'

export type Form<RDT,Out> =
  _Map<Omit<RDT,'D'>,Out> & { skip(): Out }
;

type _Map<RDT, O> =
  (
    RDT extends { D: infer D }
      ? _Handler<ReadExpand<D,$Self,O>,O>
      : unknown
  ) & (
    RDT extends { S: infer S } ?
    S extends {} ?
      { [k in keyof S as _NormalizeName<k>]: _Map<S[k],O> }
    : unknown : unknown
  )
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
  c.hello.again(9)

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

    const z = <Z><unknown>0;
    z.yo.hi(<T><unknown>0);

    type _ = Z
  }
}
catch {}

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

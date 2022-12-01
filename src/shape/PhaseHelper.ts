import { Num, ReadExpand } from "../guards/Guard";
import { $Root } from "../shapeShared";
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
    ? _Handler<ReadExpand<D,$Root,O>,O>
    : unknown)
  & (S extends {}
    ? { [k in keyof S]: _Map<S[k],O> }
    : unknown)
  
  : never
;

type _Handler<V,Out> =
  IsNotNever<V> extends true
  ? ((d: V) => Out)
  : (() => Out);

try {
  type N = {
    D_M: 1
    D_M_hello_again: typeof Num
    D_M_hello_moo: 3
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

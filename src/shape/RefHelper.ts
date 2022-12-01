import { Num, Read, Str } from "../guards/Guard";
import { Id } from "../lib";
import { Simplify } from "../util";
import { IsNotNever } from "./World";
import * as NodeTree from './NodeTree'
import * as RelPaths from './RelPaths'

//todo RelPaths should path in space rather than node
//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

export type Form<RDT> =
  RDT extends { S:infer S } ?
  _MapSpace<S>
  : never
;

type _MapNode<RDT> =
  RDT extends { D?:infer DTup, S?:infer S } ?

  (
    S extends {} ?
    Simplify<_MapSpace<S>>
    : never
  ) extends infer VS ?

  (
    DTup extends [infer D] ?
    Creator<Read<D>>
    : never
  ) extends infer VD ?

  [IsNotNever<VS>, IsNotNever<VD>] extends infer V ?
      V extends [true, true] ? (VS & VD)
    : V extends [true, false] ? VS
    : V extends [false, true] ? VD

  : never : never : never : never : never
;


type _MapSpace<S> =
  {
    [
      N in (
        keyof S extends infer K ?
        K extends keyof S ?
        K extends string ?
        _MapNode<S[K]> extends infer Inner ?
        IsNotNever<Inner> extends true ?
          [
            K,
            Inner
          ]
          : never : never : never : never : never
      ) as N[0]
    ]: N[1]
  }
;

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

  type A = NodeTree.Form<W>;
  type B = RelPaths.Form<A,['tara']>
  type C = Form<B>;

  const c = <C><unknown>undefined;
  c.hello.moo('123')
  c.tara.moo();
  c.moo();

  type _ = [A,B,C];
}
catch {}

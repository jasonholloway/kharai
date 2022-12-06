import { Guard, Num, Read, Str } from "../guards/Guard";
import { Id } from "../lib";
import * as NodeTree from './NodeTree'
import * as RelPaths from './RelPaths'
import { IsNever, Simplify } from "../util";

// todo _Retain is inefficient: should premap new nodes with flags

export type Form<RDT> =
  _MapNode<RDT>
;

type _MapNode<N> =
  N extends { D?:infer D, S?:infer S, R?:infer R } ?
  (
    _Retain<S> extends true
      ? Simplify<_MapSpaceNode<S>>
      : unknown
  ) & (
    R extends true ? _MapDataNode<D> : unknown
  )
  : never
;

type _MapDataNode<DTup> =
  DTup extends [infer D]
    ? _Referrer<Read<D>>
    : never
;

type _MapSpaceNode<S> =
  {
    [k in keyof S
     as _Retain<S[k]> extends true ? _NormalizeName<k> : never
    ]: _MapNode<S[k]>
  }
;


type _Retain<N> =
  N extends { R?:infer R, S?:infer S } ?
  R extends true ? true :
  true extends _Retain<S[keyof S]> ? true :
  false
  : never
;


type _Referrer<V> = 
  IsNever<V> extends true ? (() => Id)
  : V extends string ? (<D extends string & V>(d: D) => Id)
  : never
;

type _NormalizeName<S> =
  S extends `*${infer S2}` ? S2
  : S
;

try {
  type W = {
    D_M: [1]
    D_M_hello_again: [typeof Num]
    D_M_hello_moo: typeof Str
    D_M_tara: [4]
    D_M_tara_moo: never
    R_M_tara_moo: true
    R_M_hello_moo: true
  };

  type A = NodeTree.Form<W>;
  type B = RelPaths.Form<A,['tara']>
  type C = _MapNode<B>
  type D = Form<B>;

  const d = <D><unknown>undefined;
  d.hello.moo('123')
  d.tara.moo();
  d.moo();

  type _ = [A,B,C,D];
}
catch {}

try {
  type W = {
    D_M_a_oink: [typeof Num]
    D_M_a_moo: typeof Str
    R_M_a_moo: true
  };

  type A = NodeTree.Form<W>;
  type B = RelPaths.Form<A,[]>
  type C = _MapNode<B>

  const e = <C><unknown>undefined;
  e.a.moo('123')

  type _ = [A,B,C];
}
catch {}

try {
  <T,S extends string>() => {
    type W = {
      D_M_hello_yep: Guard<S>
      D_M_hello_nope: Guard<T>
      D_M_hello_nah: typeof Num
      D_M_mmm: string
      D_M_mmm_yip: string
      D_M_mmm_yup: typeof Str
      D_M_mmm_nip: never
      R_M_mmm: true
      R_M_mmm_nip: true
      R_M_hello_yep: true
    }
    type N = NodeTree.Form<W>;
    type R = RelPaths.Form<N,['mmm']>;
    type Z = Form<R>

    const z = <Z><unknown>0;
    z.mmm('');
    z.mmm.nip();
    z.hello.yep(<S><unknown>0)
    // z.hello.nope(<T><unknown>0)

    type _ = Z
  }
}
catch {}

try {
  <T,S extends string>() => {
    type W = {
      D_M_a_yup: string
      D_M_a_yarp: Guard<S>
      D_M_a_narp: Guard<S>
      D_M_a_nope: Guard<T>
      R_M_a_yup: true
      R_M_a_nope: true
      R_M_a_yarp: true
    }
    type A = NodeTree.Form<W>;
    type B = RelPaths.Form<A,[]>;
    type C = Form<B>

    const c = <C><unknown>0;
    c.a.yup('moo')
    c.a.yarp(<S><unknown>0);

    // c.a.nope(<T><unknown>0)
    // c.a.narp(<S><unknown>0)

    type _ = [A,B,C];
  }
}
catch {}

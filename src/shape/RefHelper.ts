import { Guard, Num, Read, Str } from "../guards/Guard";
import { Id } from "../lib";
import * as NodeTree from './NodeTree'
import * as RelPaths from './RelPaths'

// todo _Retain is inefficient: should premap new nodes with flags

export type Form<RDT> =
  _MapNode<Omit<RDT,'D'>>
;

type _MapNode<N> =
  true extends _Retain<N> ? (
    _MapDataNode<N> extends infer M1 ?
    _MapSpaceNode<N> extends infer M2 ?
    M1 & M2 //Merge<M1,M2>
    : never : never
  )
  : never
;

type _MapDataNode<N> =
  N extends { D: [infer D] } ?
  (v: Read<D>) => Id
  : unknown
;

type _MapSpaceNode<N> =
  N extends { S: infer S } ?
  {
    [k in keyof S
     as true extends _Retain<S[k]> ? _NormalizeName<k> : never
    ]: _MapNode<S[k]>
  }
  : unknown
;


type _Retain<N> = 
  N extends { R?:infer R, S?:infer S } ?
  R extends true ? true :
  true extends _Retain<S[keyof S]> ? true :
  false : false
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

  const d = <D><unknown>0;
  d.hello.moo('123')

  type _ = [A,B,C,D];
}
catch {}

try {
  <T,S extends string>() => {
    type W = {
      D_M_hello_yep: Guard<S>
      R_M_hello_yep: true
      D_M_hello_nope: Guard<T>
      D_M_hello_nah: typeof Num
      D_M_mmm: string
      R_M_mmm: true
      D_M_mmm_yip: string
      D_M_mmm_yup: typeof Str
      D_M_mmm_nip: never
      R_M_mmm_nip: true
    }
    type N = NodeTree.Form<W>;

    type R = RelPaths.Form<N,['mmm']>;
    const r = <R><unknown>0;
    r.S.hello

    type Z = Form<R>
    const z = <Z><unknown>0;
    z.mmm('');
    z.hello.yep(<S><unknown>0)

    z.mmm.nip

    type _ = [Z]
  }
}
catch {}

try {
  <T,S extends string>() => {
    type W = {
      D_M_a_yup: string
      R_M_a_yup: true
      D_M_a_yarp: Guard<S>
      R_M_a_yarp: true
      D_M_a_nope: Guard<T>
    }
    type A = NodeTree.Form<W>;
    type B = RelPaths.Form<A,[]>;
    type C = Form<B>

    const c = <C><unknown>0;
    c.a.yup('moo')
    c.a.yarp(<S><unknown>0);

    type _ = [A,B,C];
  }
}
catch {}

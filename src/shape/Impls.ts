import { ReadExpand } from "../guards/Guard";
import { PathCtx } from "../MachineSpace";
import { $Root } from "../shapeShared";
import { Merge } from "../util";
import * as NodeTree from './NodeTree'

export type Form<T, N, O> =
  // _Data<N> extends infer DOne ?
  // _Data<N, DOne> extends infer DFull ?
  _Form<T, T, O> extends { M?: infer M } ?
  M
  : {}
  // : never : never
;
//also need to extract 'M'
//D and X need more special names

type _Form<T0, T, O> =
  (
    T extends { D:infer TD, X:infer TX } ?
    PathCtx<T0,[],O> extends infer PX ?
    Merge<TX, PX> extends infer X ?
      _Phase<TD,X,O>
    : never : never : unknown
  )
  & (
    {
      [
        K in keyof T
        as K extends 'D'|'X' ? never : K
      ]?: _Form<T0, T[K], O>
    }
  )
;

type _Phase<D, X, O> =
  _Handler<D,X,O> | { act:_Handler<D,X,O>, show?: (d:ReadExpand<D,$Root,O>)=>unknown[] }
;

type _Handler<D, X, O> = 
  (x:X, d:ReadExpand<D,$Root,O>)=>Promise<O|false>
;

{
  type N = {
    XA: { a:1 },
    D_M_dog_woof: 999,
    XA_M_dog: { b:2 },
    D_M_cat_meeow: 456
  };

  type T = NodeTree.Form<N>
  type C = Form<T, N, 'O'>

  const c: C = <C><unknown>{};
  c

  type _ = [C, T]
}

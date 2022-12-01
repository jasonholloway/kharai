import { ReadExpand } from "../guards/Guard";
import { $Root } from "../shapeShared";
import { Merge } from "../util";
import * as NodeTree from './NodeTree'
import * as RelPaths from './RelPaths'
import * as PhaseHelper from './PhaseHelper'
import * as RefHelper from './RefHelper'

//todo: RDT coming through as never...

//todo: filter out prefixed tree props...
export type Form<T,O> =
  // _Data<N> extends infer DOne ?
  // _Data<N, DOne> extends infer DFull ?
  _MapNode<T,[],T,O> extends { M?: infer M } ?
  M
  : {}
  // : never : never
;


//TODO
//- calc RelPaths once per node

type _MapNode<T0,PL extends string[],T,O> =
  RelPaths.Form<T0,PL> extends infer RDT ?
  _TryMapSpace<T0,PL,T,O> extends infer Space ?
  _TryMapPhase<RDT,T,O> extends infer Phase ?
  Merge<Space, Phase> extends infer Merged ?
  unknown extends Merged ? never
  : Merged
: never : never : never : never
;

type _TryMapSpace<T0,PL extends string[],T,O> =
  T extends { S: infer S } ?
  {
    [k in keyof S & string]?:
      _MapNode<T0,[...PL,k],S[k],O>
  }
  : unknown
;

type _TryMapPhase<RDT,T,O> =
  T extends { P: [infer X, infer D] } ?
    PhaseHelper.Form<RDT,O> extends infer PH ?
    RefHelper.Form<RDT> extends infer RH ?
    Merge<X, { refs:RH, and:PH }> extends infer X2 ?
      _Phase<D,X2,O>
  : never: never : never
  : unknown
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
  type C = _MapNode<T,[],T,'O'>

  const c: C = <C><unknown>{};
  c.M!.cat!.meeow!

  type _ = [C, T]
}

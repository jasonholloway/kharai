import { ReadExpand } from "../guards/Guard";
import { $Root } from "../shapeShared";
import { DeepSimplify, Merge } from "../util";
import * as NodeTree from './NodeTree'
import * as RelPaths from './RelPaths'
import * as PhaseHelper from './PhaseHelper'
import * as RefHelper from './RefHelper'

/*
  soit's coming through as never because our PLs are from the root
  while RelPath works from M
  Impls should treat M as its root as well
  the NodeTree should include all the accumulated stuff for us 
*/

//todo: RDT coming through as never...

//todo: filter out prefixed tree props...

export type Form<T,O> =
  NodeTree.Extract<T,['M']> extends infer MT ?
  _MapNode<T,[],MT,O>
  : never
;

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
    D_M_cat_meeow: $Root
  };

  type A = NodeTree.Form<N>
  type B = RelPaths.Form<A,[]>
  type C = _MapNode<A,[],A,'O'>
  type W = Form<A,'O'>

  const c = <C><unknown>{};
  c.M!.cat!.meeow!


  const shape = (w:W)=>{};
  shape({
    dog: {
      async woof(x,d) {
        return x.and.woof(999);
      }
    },
    cat: {
      async meeow(x,d) {
        //x.ref not working todo
        return x.and.meeow('O');
      }
    }
  });

  type _ = [A,B,C,W]
}

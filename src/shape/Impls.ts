import { ReadExpand } from "../guards/Guard";
import { $Self } from "../shapeShared";
import { Merge } from "../util";
import * as NodeTree from './NodeTree'
import * as RelPaths from './RelPaths'
import { Ctx } from "../MachineSpace";

//todo: filter out prefixed tree props...

export type Form<T,O> =
  NodeTree.Extract<T,['M']> extends infer MT ?
  _MapNode<T,[],MT,O>
  : never
;

type _MapNode<T0,PL extends string[],T,O> =
  _TryMapSpace<T0,PL,T,O> extends infer Space ?
  _TryMapPhase<T0,PL,T,O> extends infer Phase ?

  Merge<Space, Phase> extends infer Merged ?
  unknown extends Merged ? never :

  Merged

: never : never : never
;

type _TryMapSpace<T0,PL extends string[],T,O> =
  T extends { S: infer S } ?
  {} extends S ? unknown :
  {
    [k in keyof S & string]?:
      _MapNode<T0,[...PL,k],S[k],O>
  }
  : unknown
;

type _TryMapPhase<T0,PL extends string[],T,O> =
  T extends { P: [infer X, infer D] } ?
    Merge<Ctx<T0,PL,O>, X> extends infer MX ?
    _Phase<D,MX,O>
    : never
  : unknown
;

type _Phase<D, X, O> =
  _Handler<D,X,O> | { act:_Handler<D,X,O>, show?: (d:ReadExpand<D,$Self,O>)=>unknown[] }
;

type _Handler<D, X, O> = 
  (x:X, d:ReadExpand<D,$Self,O>)=>Promise<O|false>
;

{
  type N = {
    XA: { a:1 },
    D_M_dog_woof: string,
    R_M_dog_woof: true
    XA_M_dog: { b:2 },
    D_M_cat_meeow: $Self
  };

  type A = NodeTree.Form<N>
  type B = RelPaths.Form<A,[]>

  // BELOW NEEDS TO BE *MUCH* TIDIER - expanse represents inefficiency
  type C = _MapNode<A,[],A,'O'>
  type W = Form<A,'O'>


  // the problem is then performance and how it degrades
  // but first of all, how does below fail?

  const w = <W><unknown>0;

  const c = <C><unknown>{};


  const shape = (w:W)=>{};
  shape({
    dog: {
      async woof(x,d) {

        x.ref.woof
        
        return x.and.woof('grr');
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

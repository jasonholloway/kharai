import { ReadExpand } from "../guards/Guard";
import { $Self } from "../shapeShared";
import { Merge } from "../util";
import { Ctx } from "./Ctx";
import * as NodeTree from './NodeTree'
import * as RelPaths from './RelPaths'

//todo: filter out prefixed tree props...

export type Form<T0,O> =
  NodeTree.Extract<T0,['M']> extends infer T ?
  _MapNode<T0,['M'],T,O>
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

// TODO Ctx<> should accumulate X for all
type _TryMapPhase<T0,PL extends string[],T,O> =
  T extends { D: infer D } ?
    _Phase<D,Ctx<T0,PL,O>,O>
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
    X: { a:1 },
    D_M_dog_woof: string,
    R_M_dog_woof: true
    X_M_dog: { b:2 },
    D_M_cat_meeow: $Self
  };

  type A = NodeTree.Form<N>
  type B = RelPaths.Form<A,[]>
  type C = _MapNode<A,[],A,'O'>
  type D = NodeTree.Extract<A,['M']>;
  type E = Form<A,'O'>

  const shape = (_:E)=>{};

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

  type _ = [A,B,C,D,E]
}

import { Num } from "../guards/Guard";
import { DeepMerge, Merge } from "../util";
import { TupPopHead } from "./World";
import * as NodeTree from './NodeTree'

export type RelPaths<NT,PL> =
  _MapDataTree<NT> extends infer DT ?
  _RelPaths<PL,DT,DT>
  : never
;

type _RelPaths<PL,AC,NT> =
  TupPopHead<PL> extends readonly [infer Popped, infer Result] ?
  Popped extends true ? (
    //Accumulate, recurse
    Result extends readonly [infer Step, infer PL2] ?
    Step extends string ?
    NT extends { [k in Step]: infer NT2 } ?
      _RelPaths<PL2,DeepMerge<AC,NT>,NT2>
      : never : never : never
  )
  : (
    //No head; empty path list; return
    DeepMerge<AC,NT>
  )
  : never
;

type _MapDataTree<NT> =
  NT extends { P?:infer P, S?:infer S } ?

  (P extends readonly [unknown, infer D] ? { D:D } : {}) extends infer M0 ?
  (S extends {} ? { [k in keyof S]: _MapDataTree<S[k]> } : {}) extends infer M1 ?
  
  Merge<M0, M1>

  : never : never : never
;


try {
  type N = {
    D_M: [1]
    D_M_hello_again: [typeof Num]
    D_M_hello_moo: [3]
    D_M_tara: [4]
    D_M_tara_moo: never
  };

  type A = NodeTree.Form<N>;
  type B = _MapDataTree<A>;
  type C = RelPaths<A,[]>;
  type D = RelPaths<A,['M','tara']>;

  type _ = [A,B,C,D];
}
catch {}

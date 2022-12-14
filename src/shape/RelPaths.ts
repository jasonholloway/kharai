import { DeepMerge, Merge } from "../util";
import { TupPopHead } from "./World";
import * as NodeTree from './NodeTree'
import { Num } from "../guards/Guard";

// TODO: DeepMerge not suitable for merging: need something that only merges S!!!

export type Form<NT,PL extends string[]> =
  (
    PL extends ['M', ...infer MPL] ?
    MPL extends string[] ? MPL : never :
    PL
  ) extends infer MPL ?
  _MapDataTree<NT> extends infer DT ?
  DT extends { S: { M: infer MDT } } ?
  _Form<MPL,MDT,MDT>
  : never : never : never
;

//TODO: cope with S subnodes in below
type _Form<PL,AC,NT> =
  TupPopHead<PL> extends readonly [infer Popped, infer Result] ?
  Popped extends true ? (
    //Accumulate, recurse into NodeTree
    Result extends readonly [infer Step, infer PL2] ?
    Step extends string ?
    NT extends { S: { [k in Step]: infer NT2 } } ?
      _Form<PL2,DeepMerge<AC,NT>,NT2>
      : never : never : never
  )
  : (
    //No head; empty path list; time to return
    DeepMerge<AC,NT>
  )
  : never
;

type _MapDataTree<NT> =
  (NT extends { D: infer D } ? { D:D }: unknown) extends infer M0 ?
  (NT extends { R: true } ? { R:true }: unknown) extends infer M1 ?
  (NT extends { S: infer S } ? { S:{ [k in keyof S]: _MapDataTree<S[k]> } } : unknown) extends infer M2 ?
  
  Merge<M0, Merge<M1,M2>>

  : never : never : never
;


try {
  type N = {
    // D_M: 1
    // D_M_hello_again: [typeof Num]
    // D_M_hello_moo: [3]
    X_M: { a:1 }
    D_M_tara: 4
    X_M_tara: { b:2 }
    D_M_tara_moo: never
    R_M_tara_moo: true
  };

  type A = NodeTree.Form<N>;
  type B = _MapDataTree<A>;
  type C = Form<A,[]>;
  type D = Form<A,['tara']>;

  type _ = [A,B,C,D];
}
catch {}

try {
  type N = {
    D_M: 1
    D_M_hello_again: typeof Num
    'D_M_hello_*moo': 3
    D_M_tara: [4]
    D_M_tara_moo: never
  };

  type A = NodeTree.Form<N>
  type B = _MapDataTree<A>
  type C = B extends { S: { M: infer M } } ? M : never;
  type D = _Form<['tara'],C,C>

  type _ = [A,B,C,D]
}
catch {}

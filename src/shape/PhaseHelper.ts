import { Num, ReadExpand } from "../guards/Guard";
import { $Root } from "../shapeShared";
import { DeepMerge, DeepSimplify, IsNever, Merge, Simplify } from "../util";
import { Data } from "./common";
import { IsNotNever, JoinPaths, TupPopHead } from "./World";
import * as NodeTree from './NodeTree'

export type Form<N, Out> =
  Simplify<WalkData<'', ExtractData<N>, Data<N>, Out> & { skip: () => Out }>
;


//RelPaths is the shared structure to be used by PhaseHelper and RefHelper
//every node has its collected view
//which is an encapsulated tree
//but this is squaring the info of the tree
//instead of pre-assembling for all, we could just provide a shared means of assembling
//given a tree, and a path into the tree
//return me an object with types
//
//how good it would be too
//if it coincided with the shape of actual concrete data
//
//so we have the path taken, the accumulated routes, the path yet to tread, and the object yet to visit
//all the paths of the parent are available in the child, plus the unique paths of the child
//but all the paths of the parent are alreadt yielded back by the children - this is the double scan per node

//TODO: this function isn't for creating a fully populated and expanded structure
//but is rather an accessor

export type RelPaths<NT,PL> = _RelPaths<PL,NT,NT>;

type _RelPaths<PL,AC,NT> =
  TupPopHead<PL> extends readonly [infer Rest, infer Popped, infer Head] ?
  Popped extends true ? (
    //Accumulate, recurse
    'Head popped, more to do; recurse'
  )
  : (
    //No head; empty path list; return
    'plop'
    // DeepMerge<AC,NT>
  )
  : never
;
  
  // DeepMerge<AC,NT> extends infer O ?
  // O
  // : never

  
  // {
  //   [K in keyof NT & string]:
  //     Merge<
  //       _RelPaths<AC,NT[K]>,
  //       {}
  //     >
  // }
;

// 
//
//
//







type ExtractData<N> = {
  [k in keyof N as (k extends JoinPaths<JoinPaths<'D','M'|'*'>, infer P> ? P : never)]: N[k]
};

type WalkData<P extends string, D, DAll, Out> = DeepSimplify<
  (
    P extends keyof D
      ? Handler<ReadExpand<D[P], $Root, Out>, Out>
      : unknown
  )
  & (
    [ExtractNextPrefixes<P,D>] extends [infer NPS] ?
    IsNever<NPS> extends false ? 
      {
        [N in ExtractNextPrefixes<P,D> & string]: WalkData<JoinPaths<P,N>, D, DAll, Out>
      }
    : unknown : never)
>;

type Handler<V,Out> =
  IsNotNever<V> extends true
  ? ((d: V) => Out)
  : (() => Out);

type ExtractNextPrefixes<P extends string, D> =
  keyof D extends infer K ?
  K extends JoinPaths<P, JoinPaths<infer N, any>> ?
  N
  : never : never;


try {
  type N = {
    D_M: [1]
    D_M_hello_again: [typeof Num]
    // D_M_hello_moo: [3]
    D_M_tara: [4]
    // D_M_tara_moo: never
  };

  type T = NodeTree.Form<N>;

  type D = RelPaths<T,[]>;
  type E = RelPaths<T,['tara']>;

  type A = ExtractData<N>;
  type B = ExtractNextPrefixes<'', A>
  type C = ExtractNextPrefixes<'hello', A>

  type Z = WalkData<'',A,'DAll','OUT'>

  const z = <Z><unknown>undefined;

  z.hello.again([2]);
  z.tara([4]);
  // z.tara.moo();

  type _ = [A,B,C,D,E,Z];
}
catch {}

import { List } from "immutable";
import { $Root, $root, data, fac, isSpaceNode, SchemaNode, space } from "./shapeShared";
import { merge, Merge, MergeMany, Simplify } from "./util";

export const separator = '_'
export type Separator = typeof separator;

type Nodes = { [k in string]: unknown }


export type NodePath<N extends Nodes> = _ExtractPath<`N${Separator}`, keyof N> | ''
export type DataPath<N extends Nodes> = _ExtractPath<`D${Separator}`, keyof N>
type _ExtractPath<A extends string, K> = K extends `${A}${infer P}` ? P : never

{
  type N = {
    N_: true,
    N_hamster: true
    D_hamster: 123
  }

  type A = NodePath<N>
  type B = DataPath<N>

  type _ = [A,B]
}


export class Builder<N extends Nodes> {
  public readonly nodes: N
  
  constructor(nodes: N) {
    this.nodes = nodes;
  }

  add<N2 extends Nodes>(other: Builder<N2>) : Builder<Merge<N, N2>> {
    return new Builder(merge(this.nodes, other.nodes));
  }

  addFac<P extends NodePath<N>, X2>(path: P, fn: (x: PathContext<N,P>)=>X2) : Builder<Merge<N, { [k in P as `X${Separator}${k}`]: X2 }>> {
    throw 123;
    // return new Builder<D, Merge<F, { [k in P]: X2 }>>(this.data, undefined);
  }

  //todo merge in actual facnodes
}





export function shape<S extends SchemaNode>(fn: (root: $Root)=>S) : Builder<Shape<S>> {
  const s = fn($root);
  const n = prepare(walk(s, []));
  return new Builder(<Shape<S>><unknown>n);

  function walk(n: SchemaNode, p: Path) : List<Tup> {
    if(!isSpaceNode(n)) {
      return List([
        [p, n] as const
      ]);
    }

    const mine = List([
      [p, { ...n, space: undefined }] as const
    ]);
    
    const inner =
      List(Object.getOwnPropertyNames(n.space))
        .flatMap(pn => {
          const child = n.space[pn];
          return walk(child, [...p, pn])
        });

    return mine.concat(inner);
  }

  function prepare(tups: List<Tup>) {
    return tups.reduce((ac, t) => ({ ...ac, [flatPath(t[0])]: t[1] }), {});
  }

  function flatPath(p: Path) : string {
    return separator + p.join(separator);
  }

  type Tup = readonly [Path, object]
  type Path = readonly string[]
}



export type Shape<S> = Simplify<Assemble<Walk<S>>>

type Walk<O, P extends string = ''> =
  (
    KV<`N${P}`, true>
  )
  | (
    'data' extends keyof O ?
      KV<`D${P}`, O['data']>
      : never
  )
  | (
    'fac' extends keyof O ?
      KV<`X${P}`, O['fac']>
      : never
  )
  | (
    'space' extends keyof O ?
    O['space'] extends (infer S) ?
    (keyof S) extends (infer K) ?
    K extends string ?
    K extends keyof S ?
      Walk<S[K], `${P}${Separator}${K}`>
      : never : never : never : never : never
  )

type Assemble<T extends KV> =
  { [kv in T as kv[0]]: kv[1] }

type KV<K extends string = string, V = unknown>
  = readonly [K, V]

{
 const s = space({
    hamster: space({
      nibble: data(123 as const),
    }),
    rabbit: space({
      jump: data(7 as const),
      blah: fac(123 as const)
    })
  });

  type A = Walk<typeof s>
  type B = Assemble<A>

  const x = shape(_ => s)
  x

  type _ = [A,B]
}


type PathList<PS extends string> =
  ['', ..._PathList<PS>]

type _PathList<PS extends string> =
    PS extends '' ? []
  : PS extends `${infer PHead}${Separator}${infer PTail}` ? readonly [PHead, ..._PathList<PTail>]
  : readonly [PS]

{
  type A = PathList<''>
  type B = PathList<'hamster_squeak'>
  type C = PathList<'hamster_squeak_loud'>

  type _ = [A,B,C]
}




type EffectivePath<PS extends string> =
  PS extends `` ?  never
  : never

{
  type A = EffectivePath<'hamster_squeak_loud'>

  type _ = [A]
}






// type PathContext<N extends Nodes, P extends NodePath<N>> =
//   _PathContext<N, PathList<P>>

// type _PathContext<N extends Nodes, PL extends string[]> =
//   MergeMany<_EffectiveContexts<N, PL>>

// type _EffectiveContexts<N extends Nodes, PL extends string[]> =
//     PL extends readonly [] ? readonly []
//   : PL extends readonly [infer PElem] ? (
//     PElem extends keyof N ? [N[PElem]] : []
//   )
//   : PL extends readonly [infer PHead, ...infer PTail] ? (
//     PHead extends string ?
//     `X_${PHead}` extends infer K ? never
//       : never : never
    
//     // PHead extends keyof N ? [N[PHead]] : []
//   )
//   : never;


//need to recurse backwards


// type EffectiveNodes<N, PL extends PathList<string>> =
//   ( PL extends readonly [] ? readonly [N]
//   // : string[] extends PL ? readonly SchemaNode[] 
//   : N extends SpaceNode<infer I> ? (
//       Head<PL> extends infer PHead ? (
//         PHead extends keyof I
//           ? readonly [N, ...EffectiveNodes<I[PHead], Tail<PL>>]
//           : never
//       )
//       : never
//     )
//   : never
//   )

type PathContext<N extends Nodes, P extends NodePath<N>> =
  MergeMany<_EffectiveContexts<N, '', P>>

type _EffectiveContexts<N, Path extends string, P extends string> =
  P extends '' ? (
    `X${Path}` extends infer K ? (
      K extends keyof N ?
        readonly [N[K]]
        : []
    ) : never
  )
  : P extends `${infer H}${Separator}${infer T}` ? (
    `${Path}_${H}` extends infer NewPath ?
    NewPath extends string ?
      readonly [..._EffectiveContexts<N, Path, H>, ..._EffectiveContexts<N, NewPath, T>]
      : never : never
  )
  : P extends string ? (
    `${Path}_${P}` extends infer NewPath ?
    NewPath extends string ?
      _EffectiveContexts<N, NewPath, ''>
      : never : never
  )
  : never
  

{
  type N = {
    X: { a: 1 }
    N_: true,
    X_hamster: { b: 2 },
    N_hamster: true,
    N_hamster_squeak: true
    N_hamster_squeak_quietly: true
    X_hamster_squeak_quietly: { c: 3 },
  }

  type A = NodePath<N>
  type B = _EffectiveContexts<N, '', ''>
  type C = _EffectiveContexts<N, '', 'hamster'>
  type D = _EffectiveContexts<N, '', 'hamster_squeak_quietly'>
  type E = PathContext<N, 'hamster_squeak_quietly'>

  type _ = [A, B, C, D, E]
}

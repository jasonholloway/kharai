import { List } from "immutable";
import { $Root, $root, data, isSpaceNode, SchemaNode, space } from "./shapeShared";
import { merge, Merge, mergeDeep, MergeDeep, Simplify } from "./util";

export const separator = '_'
export type Separator = typeof separator;



export class Builder<N> {
  public readonly nodes: N
  
  constructor(nodes: N) {
    this.nodes = nodes
  }

  add<B>(other: Builder<B>) : Builder<MergeDeep<N, B>> {
    return new Builder(mergeDeep(this.nodes, other.nodes));
  }
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


export type Shape<S> =
  Simplify<Assemble<Walk<S>>>


type KV<K extends string = string, V = unknown>
  = readonly [K, V]


type Walk<O, P extends string = ''> =
  KV<P extends '' ? Separator : P,
    Simplify<Omit<O, 'space'>>>
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


{
  const s = space({
    hamster: space({
      nibble: data(123 as const),
    }),
    rabbit: space({
      jump: data(7 as const)
    })
  });

  type A = Walk<typeof s>
  type B = Assemble<A>

  type _ = [A,B]
}



import { Map, List } from "immutable";
import { FacNode } from "./facs";
import { Read } from "./guards/Guard";
import { $Data, $Fac, data, fac, SchemaNode, Handler, $data, $Root } from "./shapeShared";
import { merge, Merge, MergeMany, Simplify } from "./util";

export const separator = '_'
export type Separator = typeof separator;

type Nodes = { [k in string]: unknown }

export type NodePath<N extends Nodes> = _ExtractPath<`S${Separator}` | `D${Separator}`, keyof N> | ''
export type DataPath<N extends Nodes> = _ExtractPath<`D${Separator}`, keyof N>
type _ExtractPath<A extends string, K> = K extends `${A}${infer P}` ? P : never


export type Data<N extends Nodes, Inner = unknown> =
  keyof N extends infer K ?
  K extends `D${Separator}${infer P}` ?
  N[K] extends infer G ?
  Read<G, $Root, Inner> extends infer D ?
  [P, D]
  : never : never : never : never;

type WithFac<N extends Nodes, P extends NodePath<N>, X>
  = Merge<N, { [k in P as k extends '' ? 'X' : `X${Separator}${k}`]: X }>;


export class Builder<N extends Nodes> {
  public readonly nodes: N
  readonly reg: Registry
  
  constructor(nodes: N, reg?: Registry) {
    this.nodes = nodes;
    this.reg = reg ?? Registry.empty;
  }

  add<N2 extends Nodes>(other: Builder<N2>): Builder<Merge<N, N2>> {
    return new Builder(merge(this.nodes, other.nodes), this.reg);
  }

  impl<S extends Impls<N>>(s: S): Builder<N> {
    const reg2 = _walk(s, [], this.reg);
    return new Builder(this.nodes, reg2);

    function _walk(n: unknown, pl: string[], r: Registry): Registry {
      switch(typeof n) {
        case 'function':
          return r.addHandler(formPath(pl), <Handler>n);

        case 'object':
          return Object.getOwnPropertyNames(n)
              .reduce((ac, pn) => _walk((<any>n)[pn], [...pl, pn], ac), r);

        default:
          throw Error('strange item encountered');
      }
    }
  }

  fac<P extends NodePath<N>, X2>(path: P, fn: (x: PathContext<N,P>)=>X2) : Builder<WithFac<N, P, X2>> {
    return <Builder<WithFac<N, P, X2>>><unknown>this;
  }

  read(address: string): ReadResult {
    const reg = this.reg;
    return _read([], address.split(separator));

    function _read(pl: readonly string[], al: readonly string[]): ReadResult {
      if(al.length) {
        const [aHead, ...aTail] = al;
        return _read([...pl, aHead], aTail);
      }

      const path = formPath(pl);

      return {
        guard: reg.getGuard(path),
        handler: reg.getHandler(path),
        fac: _findFac(pl)
      };
    }

    function _findFac(pl: readonly string[]) : FacNode<unknown>|undefined {
      //TODO
      return undefined;
    }
  }
}

function formPath(pl: readonly string[]) {
  return pl.join(separator);
}


export type ReadResult = {
  guard?: any,
  handler?: Handler,
  fac?: FacNode<unknown>
}

class Registry {
  private guards: Map<string, unknown> = Map();
  private handlers: Map<string, Handler> = Map();

  private constructor(guards: Map<string, unknown>, handlers: Map<string, Handler>) {
    this.guards = guards;
    this.handlers = handlers;
  }

  static empty = new Registry(Map(), Map());
  private static $notFound = Symbol('notFound');

  addGuard(p: string, guard: unknown): Registry {
    return new Registry(
      this.guards.set(p, guard),
      this.handlers
    );
  }

  getGuard(p: string): [unknown] | undefined {
    const result = this.guards.get(p, Registry.$notFound);
    return result !== Registry.$notFound
      ? [result] : undefined;
  }

  addHandler(p: string, h: Handler): Registry {
    return new Registry(
      this.guards,
      this.handlers.set(p, h)
    );
  }

  getHandler(p: string): Handler | undefined {
    return this.handlers.get(p);
  }
}


export function shape<S extends SchemaNode>(s: S) : Builder<Shape<S>> {

  const reg = _walk([], s)
    .reduce(
      (ac, [p, g]) => ac.addGuard(p, g),
      Registry.empty
    );

  return new Builder<Shape<S>>(<Shape<S>><unknown>undefined, reg);


  function _walk(pl: string[], n: SchemaNode) : List<readonly [string, unknown]> {
    if((<any>n)[$data]) {
      const data = <unknown>(<any>n)[$data];
      return List([[pl.join(separator), data] as const]);
    }

    if(typeof n === 'object') {
      return List(Object.getOwnPropertyNames(n))
        .flatMap(pn => {
          const child = (<any>n)[pn];
          return _walk([...pl, pn], child)
        });
    }

    throw 'strange node encountered';
  }
}



export type Shape<S> = Simplify<_ShapeAssemble<_ShapeWalk<S>>>

type _ShapeWalk<O, P extends string = ''> =
  (
    Intersects<$Fac | $Data, keyof O> extends true
    ? ( //we're not a space...
      _DataWalk<O, P> | _FacWalk<O, P>
        // (
        //   $Data extends keyof O ?
        //     KV<`D${P}`, O[$Data]>
        //     : never
        // )
        // | (
        //   $Fac extends keyof O ?
        //     _FacWalk<O, P>
        //     : never
        // )
    )
    : ( //we are a space...
      KV<`S${P}`, true>
      | (
        (keyof O) extends (infer K) ?
        K extends string ?
        K extends keyof O ?
          (K extends '$'
            ? _FacWalk<O[K], P>
            : _ShapeWalk<O[K], `${P}${Separator}${K}`>)
          : never : never : never
      )
    )
  )

type _DataWalk<O, P extends string> =
  $Data extends keyof O ?
  O[$Data] extends infer D ?
  KV<`D${P}`, D>
  : never : never;

type _FacWalk<O, P extends string> =
  $Fac extends keyof O ?
  O[$Fac] extends infer F ?
  KV<`X${P}`, F>
  : never : never;

type _ShapeAssemble<T extends KV> =
  { [kv in T as kv[0]]: kv[1] }

type KV<K extends string = string, V = unknown>
  = readonly [K, V]

export type Intersects<A, B> =
  [A & B] extends [never] ? false : true;

{
 const s = {
    hamster: {
      nibble: data(123 as const),
    },
    rabbit: {
      jump: data(7 as const),
      blah: fac(123 as const)
    }
  };

  type A = _ShapeWalk<typeof s>
  type B = _ShapeAssemble<A>

  const x = shape(s)
  x

  type C = 14 & unknown

  type _ = [A,B,C]
}




type Impls<N extends Nodes> =
  Data<N> extends infer DOne ?
  Data<N, DOne> extends infer DFull ?
  _ImplAssemble<N, _ImplWalk<N>, DFull, DOne>
  : never : never;

type _ImplWalk<N extends Nodes, Path extends string = '', Trail = []> =
  keyof N extends infer K ?
  K extends `${infer T}${Path}${Separator}${_WholeOnly<infer Rest>}` ?
  [K, Trail] extends infer Trail ?
  T extends 'S' ? (
    [Rest, 'S', Trail, _ImplWalk<N, `${Path}${Separator}${Rest}`, Trail>]
  )
  : T extends 'D' ? (
    [Rest, 'D', Trail, N[K]]
  )
  : never : never : never : never;

type _ImplAssemble<N extends Nodes, Tup, DFull, DOne> =
  // Simplify<{
  {
    [K in Tup extends any[] ? Tup[0] : never]?:
    (
      Tup extends [K, infer Type, infer Trail, infer Body] ?
        Type extends 'S' ? _ImplAssemble<N, Body, DFull, DOne>
        : Type extends 'D' ? (((x:_TrailContext<N, Trail>, d:Read<Body, $Root, DOne>) => Promise<DFull|false>))
      : never
      : never
    )
  }
  // }>

type _TrailContext<N extends Nodes, Trail> =
  Trail extends [] ? (
    'X' extends keyof N
      ? N['X']
      : {}
  )
  : Trail extends [infer H, infer T] ?
    _TrailContext<N, T> extends infer AboveX ?
    H extends `${string}${infer Path}` ?
    `X${Path}` extends infer XPath ?
    XPath extends keyof N
      ? Merge<AboveX, N[XPath]>
      : AboveX
  : never : never : never : never;

type _WholeOnly<S extends string> =
  S extends '' ? never
  : S extends `${string}${Separator}${string}` ? never
  : S;

{
  type N = {
    S: true,
    S_hamster: true
    S_hamster_squeak: true
    D_hamster_squeak_quietly: 123
    D_hamster_bite: 456,
  }

  type A = NodePath<N>
  type B = DataPath<N>
  type I = Impls<N>

  const i:I = {
    hamster: {
      squeak: {
        async quietly(x, d) {
          throw 123;
        }
      }
    }
  };

  type _ = [A,B,I]
  i
}


export type PathContext<N extends Nodes, P extends NodePath<N>> =
  MergeMany<_AllPathContexts<N, P>>

type _AllPathContexts<N, P extends string> =
  readonly [_RootContext<N>, ..._PathContexts<N, '', P>]

type _RootContext<N> =
  'X' extends keyof N ? N['X'] : unknown;

type _PathContexts<N, Path extends string, P extends string> =
  P extends `${infer H}${Separator}${infer T}` ? (
    `${Path}_${H}` extends infer NewPath ?
    NewPath extends string ?
      readonly [..._PathContexts<N, Path, H>, ..._PathContexts<N, NewPath, T>]
      : never : never
  )
  : P extends string ? (
    `X${Path}_${P}` extends infer K ?
    K extends keyof N ?
      readonly [N[K]]
      : [] : never
  )
  : never;
  

{
  type N = {
    X: { a: 1 }
    S: true,
    X_hamster: { b: 2 },
    S_hamster: true,
    S_hamster_squeak: true
    D_hamster_squeak_quietly: 999,
    X_hamster_squeak_quietly: { c: 3 },
  }

  type A = NodePath<N>
  type B = _AllPathContexts<N, ''>
  type C = _AllPathContexts<N, 'hamster'>
  type D = _AllPathContexts<N, 'hamster_squeak_quietly'>
  type E = PathContext<N, 'hamster_squeak_quietly'>

  type _ = [A, B, C, D, E]
}

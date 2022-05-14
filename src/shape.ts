import { Map, List } from "immutable";
import { Guard } from "./guards/Guard";
import { $Root, $root, $Data, $Fac, data, fac, isSpaceNode, SchemaNode, $space, Handler, isDataNode, isContextNode, $data, $fac } from "./shapeShared";
import { isString, merge, Merge, MergeMany, Simplify } from "./util";

export const separator = '_'
export type Separator = typeof separator;

type Nodes = { [k in string]: unknown }


export type NodePath<N extends Nodes> = _ExtractPath<`S${Separator}` | `D${Separator}`, keyof N> | ''
export type DataPath<N extends Nodes> = _ExtractPath<`D${Separator}`, keyof N>
type _ExtractPath<A extends string, K> = K extends `${A}${infer P}` ? P : never


export type Data<N extends Nodes> =
  keyof N extends infer K ?
  K extends `D${Separator}${infer P}` ?
  [P, N[K]]
  : never
  : never;



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

  impl<S extends Impl<N>>(s: S): Builder<N> {
    throw 123
  }

  addFac<P extends NodePath<N>, X2>(path: P, fn: (x: PathContext<N,P>)=>X2) : Builder<Merge<N, { [k in P as `X${Separator}${k}`]: X2 }>> {
    throw 123;
    // return new Builder<D, Merge<F, { [k in P]: X2 }>>(this.data, undefined);
  }


  //todo merge in actual facnodes

  read(state: any): ReadResult {
    return match(this.reg, state);
  }
}


function match(reg: Registry, state: any): ReadResult {

  if(!Array.isArray(state)) return _fail('state must be tuple');
  if(!isString(state[0])) return _fail('first element of state must be address string');

  const address = state[0].split(separator);
  const data = state[1];

  //2) walk nodes, accumulating facs
  //4) bind payload
  // return _match(ReadMode.Resolving, [], address);
  return _walk([], address);

  function _walk(pl: readonly string[], al: readonly string[]): ReadResult {
    if(al.length == 0) {
      const path = _formPath(pl);
      const handler = reg.getHandler(path);

      if(!handler) return _fail(`no handler at ${path}`);

      return _ok({
        data,
        handler,
        // summonContext: () => {
        //   return List(pn)
        //     .filter(isContextNode)
        //     .reduce(
        //       (ac, cn) => {
        //         return merge(ac, cn[$fac].summon('MAGIC ROOT HERE'))
        //       },
        //       {});
        // },
      });
    }
    
    const [aHead, ...aTail] = al;

    return _walk([...pl, aHead], aTail);
  }

  function _formPath(pl: readonly string[]) {
    return pl.join(separator);
  }

  

  //NB no need for the mode here, can just use two separate methods...

  function _match(m: ReadMode, pl: readonly string[], al: readonly string[]): ReadResult {
    switch(m) {
      case ReadMode.Resolving:
        if(al.length == 0) {
          return _match(ReadMode.Validating, pl, []);
        }
        
        //no n here... need to look up full address and check type
        //which means... we do actually need values output in nodes, not just types
        if(!isSpaceNode(n)) return _fail(`imprecise address ${address} requires SpaceNode`);

        const [alHead, ...alTail] = al;
        return _match(m, [...pl, alHead], alTail);

      case ReadMode.Validating:
        if(!isDataNode(n)) return _fail('wrong node for mode')

        const isValid = Guard(n[$data], (s, v) => {
          if(s === $root) {
            const result = oldMatch(schema, reg, v);
            return result.isValid;
          }
        })(data);

        if(!isValid) return _fail(`payload ${data} not valid at ${address.join(':')}`);

        return _ok({
          data,
          summonContext: () => {
            return List(pn)
              .filter(isContextNode)
              .reduce(
                (ac, cn) => {
                  return merge(ac, cn[$fac].summon('MAGIC ROOT HERE'))
                },
                {});
          },
          handler: reg.getHandler(pl.join(':'))
        });
      }

      return _fail(`unexpected schema node ${n}`);
    }

    function _ok(body: Omit<ReadResult, 'isValid' | 'errors'>): ReadResult {
      return {
        isValid: true,
        errors: [],
        ...body
      };
    }

    function _fail(message: string): ReadResult {
      return {
        isValid: false,
        errors: [ message ],
      };
    }
}




enum ReadMode {
  Resolving,
  Failed,
  Validating,
  Validated
}

export type ReadResult = {
  errors: string[],
  isValid: boolean,
  data?: any,
  handler?: Handler,
  summonContext?: () => any
}

//TODO below must be COW
class Registry {
  private handlers: Map<string, Handler> = Map();

  private constructor(handlers: Map<string, Handler>) {
    this.handlers = handlers;
  }

  static empty = new Registry(Map());

  addHandler(p: string, h: Handler): Registry {
    return new Registry(this.handlers.set(p, h));
  }

  getHandler(p: string): Handler | undefined {
    return this.handlers.get(p);
  }
}



export function oldMatch(schema: SchemaNode, reg: Registry, data: any): ReadResult {
  if(!Array.isArray(data)) return _fail('data must be tuple');
  if(!isString(data[0])) return _fail('first element of data must be address string');

  const address = data[0].split(':');
  const payload = data[1]; //.slice(1);

  return _match(ReadMode.Resolving, [], [], schema, address);

  function _match(m: ReadMode, pl: readonly string[], pn: readonly SchemaNode[], n: SchemaNode, a: readonly string[]): ReadResult {
    if(!n) return _fail('no node mate');

    switch(m) {
      case ReadMode.Resolving:
        if(a.length == 0) {
          return _match(ReadMode.Validating, pl, [...pn, n], n, []);
        }
        
        if(!isSpaceNode(n)) return _fail(`imprecise address ${address} requires SpaceNode`);

        const nextPart = a[0];
        return _match(m, [...pl, nextPart], [...pn, n], n[$space][nextPart], a.slice(1));

      case ReadMode.Validating:
        if(!isDataNode(n)) return _fail('wrong node for mode')

        const isValid = Guard(n[$data], (s, v) => {
          if(s === $root) {
            const result = oldMatch(schema, reg, v);
            return result.isValid;
          }
        })(payload);

        if(!isValid) return _fail(`payload ${payload} not valid at ${address.join(':')}`);

        return _ok({
          payload,
          summonContext: () => {
            return List(pn)
              .filter(isContextNode)
              .reduce(
                (ac, cn) => {
                  return merge(ac, cn[$fac].summon('MAGIC ROOT HERE'))
                },
                {});
          },
          handler: reg.getHandler(pl.join(':'))
        });
      }

      return _fail(`unexpected schema node ${n}`);
    }

    function _ok(body: Omit<ReadResult, 'isValid' | 'errors'>): ReadResult {
      return {
        isValid: true,
        errors: [],
        ...body
      };
    }

    function _fail(message: string): ReadResult {
      return {
        isValid: false,
        errors: [ message ],
      };
    }
  }




export function shape<S extends SchemaNode>(arg: ((root: $Root)=>S)|S) : Builder<Shape<S>> {
  
  const s = <S>(isFunction(arg) ? (<(root:$Root)=>S>arg)($root) : arg);

  const n = prepare(walk(s, []));
  return new Builder(<Shape<S>><unknown>n);

  function walk(n: SchemaNode, p: Path) : List<Tup> {
    if(!isSpaceNode(n)) {
      return List([
        [p, n] as const
      ]);
    }

    const mine = List([
      [p, { ...n, [$space]: undefined }] as const
    ]);

    const space = n[$space];
    
    const inner =
      List(Object.getOwnPropertyNames(space))
        .flatMap(pn => {
          const child = space[pn];
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







export type Shape<S> = Simplify<_ShapeAssemble<_ShapeWalk<S>>>

type _ShapeWalk<O, P extends string = ''> =
  (
    Intersects<$Fac | $Data, keyof O> extends true
    ? ( //we're not a space...
        (
          $Data extends keyof O ?
            KV<`D${P}`, O[$Data]>
            : never
        )
        | (
          $Fac extends keyof O ?
            KV<`X${P}`, O[$Fac]>
            : never
        )
    )
    : ( //we are a space...
      KV<`S${P}`, true>
      | (
        (keyof O) extends (infer K) ?
        K extends string ?
        K extends keyof O ?
          _ShapeWalk<O[K], `${P}${Separator}${K}`>
          : never : never : never
      )
    )
  )

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

  const x = shape(_ => s)
  x

  type _ = [A,B]
}




type Impl<N extends Nodes> =
  _ImplAssemble<N, _ImplWalk<N>>

type _ImplWalk<N extends Nodes, Path extends string = '', X = unknown> =
  keyof N extends infer K ?
  K extends `${infer T}${Path}${Separator}${_WholeOnly<infer Rest>}` ?
  (
    `X${Path}${Separator}${Rest}` extends infer XK ?
    XK extends keyof N ?     
    Merge<X, N[XK]>
    : X
    : X
  ) extends infer NX ?
  T extends 'S' ? (
    [Rest, 'S', NX, _ImplWalk<N, `${Path}${Separator}${Rest}`>]
  )
  : T extends 'D' ? (
    [Rest, 'D', NX, N[K]]
  )
  : never : never : never : never;

type _ImplAssemble<N extends Nodes, Tup> =
  Simplify<{
    [K in Tup extends any[] ? Tup[0] : never]?:
    (
      Tup extends [K, infer Type, infer X, infer Inner] ?
      Type extends 'S' ? _ImplAssemble<N, Inner>
      : Type extends 'D' ? (((x:X, d:Inner) => Promise<Data<N>>))
      : never
      : never
    )
  }>

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

  //TODO
  //data nodes to not also appear as space nodes
  //TODO

  type A = NodePath<N>
  type B = DataPath<N>
  type I = Impl<N>

  const i:I = {
    hamster: {
      squeak: {
        async quietly(x, d) {
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

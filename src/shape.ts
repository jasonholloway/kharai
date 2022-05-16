import { Map, List } from "immutable";
import { isFunction } from "util";
import { $Data, $Fac, data, fac, isSpaceNode, SchemaNode, $space, Handler, isDataNode } from "./shapeShared";
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
          return r.addHandler(_formPath(pl), <Handler>n);

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

  read(state: any): ReadResult {
    return _read(this.reg, state);
  }
}


function _read(reg: Registry, state: any): ReadResult {

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

  

  //NB no need for the mode here, can just use two separate methods...

  // function _match(m: ReadMode, pl: readonly string[], al: readonly string[]): ReadResult {
  //   switch(m) {
  //     case ReadMode.Resolving:
  //       if(al.length == 0) {
  //         return _match(ReadMode.Validating, pl, []);
  //       }
        
  //       //no n here... need to look up full address and check type
  //       //which means... we do actually need values output in nodes, not just types
  //       if(!isSpaceNode(n)) return _fail(`imprecise address ${address} requires SpaceNode`);

  //       const [alHead, ...alTail] = al;
  //       return _match(m, [...pl, alHead], alTail);

  //     case ReadMode.Validating:
  //       if(!isDataNode(n)) return _fail('wrong node for mode')

  //       const isValid = Guard(n[$data], (s, v) => {
  //         if(s === $root) {
  //           const result = oldMatch(schema, reg, v);
  //           return result.isValid;
  //         }
  //       })(data);

  //       if(!isValid) return _fail(`payload ${data} not valid at ${address.join(':')}`);

  //       return _ok({
  //         data,
  //         summonContext: () => {
  //           return List(pn)
  //             .filter(isContextNode)
  //             .reduce(
  //               (ac, cn) => {
  //                 return merge(ac, cn[$fac].summon('MAGIC ROOT HERE'))
  //               },
  //               {});
  //         },
  //         handler: reg.getHandler(pl.join(':'))
  //       });
  //     }

  //     return _fail(`unexpected schema node ${n}`);
  //   }

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

function _formPath(pl: readonly string[]) {
  return pl.join(separator);
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



// export function oldMatch(schema: SchemaNode, reg: Registry, data: any): ReadResult {
//   if(!Array.isArray(data)) return _fail('data must be tuple');
//   if(!isString(data[0])) return _fail('first element of data must be address string');

//   const address = data[0].split(':');
//   const payload = data[1]; //.slice(1);

//   return _match(ReadMode.Resolving, [], [], schema, address);

//   function _match(m: ReadMode, pl: readonly string[], pn: readonly SchemaNode[], n: SchemaNode, a: readonly string[]): ReadResult {
//     if(!n) return _fail('no node mate');

//     switch(m) {
//       case ReadMode.Resolving:
//         if(a.length == 0) {
//           return _match(ReadMode.Validating, pl, [...pn, n], n, []);
//         }
        
//         if(!isSpaceNode(n)) return _fail(`imprecise address ${address} requires SpaceNode`);

//         const nextPart = a[0];
//         return _match(m, [...pl, nextPart], [...pn, n], n[$space][nextPart], a.slice(1));

//       case ReadMode.Validating:
//         if(!isDataNode(n)) return _fail('wrong node for mode')

//         const isValid = Guard(n[$data], (s, v) => {
//           if(s === $root) {
//             const result = oldMatch(schema, reg, v);
//             return result.isValid;
//           }
//         })(payload);

//         if(!isValid) return _fail(`payload ${payload} not valid at ${address.join(':')}`);

//         return _ok({
//           payload,
//           summonContext: () => {
//             return List(pn)
//               .filter(isContextNode)
//               .reduce(
//                 (ac, cn) => {
//                   return merge(ac, cn[$fac].summon('MAGIC ROOT HERE'))
//                 },
//                 {});
//           },
//           handler: reg.getHandler(pl.join(':'))
//         });
//       }

//       return _fail(`unexpected schema node ${n}`);
//     }

//     function _ok(body: Omit<ReadResult, 'isValid' | 'errors'>): ReadResult {
//       return {
//         isValid: true,
//         errors: [],
//         ...body
//       };
//     }

//     function _fail(message: string): ReadResult {
//       return {
//         isValid: false,
//         errors: [ message ],
//       };
//     }
//   }




export function shape<S extends SchemaNode>(s: S) : Builder<Shape<S>> {
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

  const x = shape(s)
  x

  type C = 14 & unknown

  type _ = [A,B,C]
}




type Impls<N extends Nodes> =
  _ImplAssemble<N, _ImplWalk<N>>

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

type _ImplAssemble<N extends Nodes, Tup> =
  // Simplify<{
  {
    [K in Tup extends any[] ? Tup[0] : never]?:
    (
      Tup extends [K, infer Type, infer Trail, infer Inner] ?
      Type extends 'S' ? _ImplAssemble<N, Inner>
      : Type extends 'D' ? (((x:_TrailContext<N, Trail>, d:Inner) => Promise<Data<N>>))
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

import { List, Map } from "immutable";
import { FacNode, IfKnown } from "./facs";
import { Guard, Read } from "./guards/Guard";
import { isString, merge, Merge, MergeMany, mergeObjects } from "./util";

const $root = Symbol('root');
export type $Root = typeof $root;

enum ReadMode {
  Resolving,
  Failed,
  Validating,
  Validated
}

export type ReadResult = {
  errors: string[],
  isValid: boolean,
  payload?: any,
  handler?: Handler,
  summonContext?: () => any
}

type Handler = (x: any, d: any) => Promise<any>;


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



export class Builder<N extends SchemaNode> {
  reg: Registry
  schema: N

  constructor(schema: N, reg: Registry) {
    this.schema = schema;
    this.reg = reg;
  }

  withPhase<P extends Path<N>>(path: P, handler: (x:PathContext<N,P>, d:Arg<N,P>)=>Promise<Data<N>>) : Builder<N> {
    return new Builder<N>(this.schema, this.reg.addHandler(path, handler))
  }

  withContext<P extends Path<N>, X>(path: P, fac: (context: PathContext<N,P>)=>X): Builder<MergeAtSchemaPath<N, { fac: FacNode<X> }, PathList<P>>> {
    const pl = pathList(path);

    const nodes = effectiveNodes(this.schema, pl);
    const verticals = extractFacNodes(allButLast(nodes))
    const horizontal = firstOr(extractFacNodes(onlyLast(nodes)), FacNode.root());

    const facNode = FacNode.derive(
      [horizontal, ...verticals] as const,
      all => {
        const horiz = head(all)
        const verts = tail(all) //don't actually have to be typed thoroughly

        const context = mergeObjects(...verts, horiz);
        const result = fac(<PathContext<N, P>><unknown>context)

        return mergeObjects(horiz, result)
      });

    const schema = mergeAtSchemaPath(this.schema, { fac: facNode }, pl);

    return <Builder<MergeAtSchemaPath<N, { fac: FacNode<X> }, PathList<P>>>><unknown>new Builder(schema, this.reg);
  }

  readAny(data: any): ReadResult {
    return match(this.schema, this.reg, data);
  }
}





const w = specify(root =>
  space({
    dog: space({
      bark: data(123 as const)
    }),
    cat: data(999 as const)
  }))
  .withContext('dog', u => ({ owns: ['bone'] as const }))
  .withContext('dog:bark', u => ({ articulations: ['woof'] as const }))
  .withContext('dog:bark', u => ({ articulations: [...u.articulations, 'moo'] as const }))
  .withContext('cat', u => ({}))
w

w.schema





type MergeAtSchemaPath<N, X, PL extends readonly unknown[]> =
    PL extends readonly [] ? Merge<N, X>
  : PL extends readonly [infer PH, ...infer PT] ? (
      'space' extends keyof N ? (
        PH extends keyof N['space'] ? (
          N['space'][PH] extends infer NN ? (
            Merge<
              N,
              {
                space: Merge<
                  N['space'],
                  { [k in PH]: MergeAtSchemaPath<NN, X, PT> }>
              }>
          )
          : N
        )
        : N
      )
      : N
  )
  : N;

function mergeAtSchemaPath<N, X, PL extends PathList<Path<N>>>(n: N, x: X, pl: PL) : MergeAtSchemaPath<N, X, PL> {
  if(pl.length == 0) {
    return <MergeAtSchemaPath<N, X, PL>>merge(n, x);
  }

  if(isSpaceNode(n)) {
    const [h, ...t] = pl;

    const found = n.space[h];
    if(found) {
      return <MergeAtSchemaPath<N, X, PL>>merge(n, {
        space: merge(n.space, {
          [h]: mergeAtSchemaPath(found, x, t)
        })
      });
    }
  }

  return <MergeAtSchemaPath<N, X, PL>>n;
}

{
  const schema = {
    space: {
      dog: data(7),
      cat: {
        space: {
          meeow: data(123)
        }
      },
    }
  };


  const qqq = mergeAtSchemaPath(schema, { a: 1 as const }, pathList('cat'))
  const _____ = qqq
}




//TODO test below...

type EffectiveNodes<N, PL extends PathList<string>> =
  ( PL extends readonly [] ? readonly [N]
  // : string[] extends PL ? readonly SchemaNode[] 
  : N extends SpaceNode<infer I> ? (
      Head<PL> extends infer PHead ? (
        PHead extends keyof I
          ? readonly [N, ...EffectiveNodes<I[PHead], Tail<PL>>]
          : never
      )
      : never
    )
  : never
  )

function effectiveNodes<N, PL extends PathList<Path<N>>>(node: N, path: PL): EffectiveNodes<N, PL> {
  return <EffectiveNodes<N, PL>>([node, ...findInner()] as const);

  function findInner() {
    if(isSpaceNode(node)) {
      const nextNode = node.space[head(path)];

      if(nextNode !== undefined) {
        return effectiveNodes(nextNode, tail(path));
      }
    }

    return [] as const;
  }
}






//PATHCONTEXT DOESNT WORK
type N = typeof w.schema
type YY = PathContext<N, 'dog:bark'>
type __ = YY



// but extensions upstream should be folded into new downstreams
// which is the source of the lattice
// so we don't just pluck off the final facNode, we run them all one-by-one and recombine them
// !!!

type PathContext<N, P extends Path<N>> =   
  MergeMany<ExtractFacContexts<EffectiveNodes<N, PathList<P>>>>

type ExtractFacContexts<R extends readonly unknown[]> =
    R extends readonly [] ? readonly []
  : R extends readonly [infer H, ...infer T] ? (
      H extends { fac: FacNode<infer X> }
        ? readonly [X, ...ExtractFacContexts<T>]
        : ExtractFacContexts<T>
    )
  // : R extends readonly (infer E)[] ? (
  //     E extends { fac: FacNode<infer X> }
  //         ? readonly X[]
  //         : readonly []
  //   )
  : never


type ExtractFacNodes<R extends readonly unknown[]> =
    R extends readonly [] ? readonly []
  : R extends readonly [infer E] ?
      IfKnown<E,
        [E] extends [ContextNode<infer O>]
          ? readonly [FacNode<O>]
          : readonly []
      >
  : R extends readonly [infer H, ...infer T] ?
      readonly [...ExtractFacNodes<readonly [H]>, ...ExtractFacNodes<T>]
  : never

function extractFacNodes<R extends readonly unknown[]>(r: R) : ExtractFacNodes<R> {
  const ac = [];

  for(let i = 0; i < r.length; i++) {
    const el = r[i];
    if(isContextNode(el)) ac.push(el.fac);
  }

  return <ExtractFacNodes<R>><unknown>ac;
}


type ExtractContextNodes<R extends readonly unknown[]> =
    R extends readonly [] ? readonly []
  : R extends readonly [infer E] ?
      IfKnown<E,
        [E] extends [ContextNode<infer O>]
          ? readonly [E & ContextNode<O>]
          : readonly []
      >
  : R extends readonly [infer H, ...infer T] ?
      readonly [...ExtractContextNodes<readonly [H]>, ...ExtractContextNodes<T>]
  : never

function extractContextNodes<R extends readonly any[]>(r: R) : ExtractContextNodes<R> {
  const ac = [];

  for(let i = 0; i < r.length; i++) {
    const el = r[i];
    if(isContextNode(el)) ac.push(el);
  }

  return <ExtractContextNodes<R>><unknown>ac;
}

{
  type A = ExtractContextNodes<readonly []>
  type B = ExtractContextNodes<readonly [1, ContextNode, 2]>
  type C = ExtractContextNodes<readonly unknown[]>
  type _____ = [A, B, C]
}




type ExtractProps<R extends readonly any[], P extends string> =
    R extends readonly [] ? readonly []
  : R extends readonly [infer H, ...infer T] ? (
        P extends keyof H ? readonly [H[P], ...ExtractProps<T, P>]
      : ExtractProps<T, P>
    )
  : R extends readonly (infer E)[] ? (
        P extends keyof E ? E[P][]
      : readonly []
    )
  : never;

function extractProps<R extends readonly any[], P extends string>(r: R, p: P) : ExtractProps<R, P> {
  const ac = [];
  for(let i = 0; i < r.length; i++) ac.push(r[i][p]);
  return <ExtractProps<R, P>><unknown>ac;
}

{
  type A = ExtractProps<readonly [{a: 1}, {a: 2}], 'a'>
  type B = ExtractProps<readonly [{a: 1}, {}, {a: 2}], 'a'>
  type C = ExtractProps<readonly [], 'a'>
  type D = ExtractProps<readonly {a: 1}[], 'a'>
  type E = ExtractProps<readonly number[], 'a'>
  type _ = [A, B, C, D, E]
}






type FirstOr<R extends readonly unknown[], D> =
    R extends readonly [] ? D
  : R extends readonly [infer E, ...any] ? IfKnown<E>
  : never;

function firstOr<R extends readonly any[], D>(r: R, defaultVal: D) : FirstOr<R, D> {
  return r.length ? r[0] : defaultVal;
}

{
  type A = FirstOr<readonly [], '!'>
  type B = FirstOr<readonly [1], '!'>
  type C = FirstOr<readonly [1, 2], '!'>
  type D = FirstOr<readonly boolean[], '!'>
  type E = FirstOr<readonly boolean[], true>
  type F = FirstOr<readonly [] | readonly [true], true>
  type _ = [A, B, C, D, E, F]
}








function pathList<PS extends string>(ps: PS): PathList<PS> {
  return <PathList<PS>><unknown>ps.split(':');
}

type PathList<PS extends string> =
    PS extends '' ? readonly []
  : PS extends `${infer PHead}:${infer PTail}` ? readonly [PHead, ...PathList<PTail>]
  : string extends PS ? readonly string[]
  : readonly [PS];


export function match(schema: SchemaNode, reg: Registry, data: any): ReadResult {
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
        return _match(m, [...pl, nextPart], [...pn, n], n.space[nextPart], a.slice(1));

      case ReadMode.Validating:
        if(!isDataNode(n)) return _fail('wrong node for mode')

        const isValid = Guard(n.data, (s, v) => {
          if(s === $root) {
            const result = match(schema, reg, v);
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
                  return merge(ac, cn.fac.summon('MAGIC ROOT HERE'))
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

export function specify<S extends SchemaNode>(fn: (root: $Root)=>S) {
  return new Builder(fn($root), Registry.empty)
    .withContext('', () => ({ hello: 123 }));
}


export type SchemaNode = {}
export type DataNode<D> = { data: D }
export type SpaceNode<I> = { space: I }
export type HandlerNode = { handler: Handler }
export type ContextNode<X = unknown> = { fac: FacNode<X> }

function isDataNode(v: SchemaNode): v is DataNode<any> {
  return (<any>v).data;
}

function isSpaceNode(v: any): v is SpaceNode<any> {
  return (<any>v).space;
}

function isContextNode(v: any): v is ContextNode {
  return (<any>v).fac;
}

function isHandlerNode(v: any): v is HandlerNode {
  return (<any>v).handler;
}

export function data<S>(s: S): DataNode<S> {
  return { data: s };
}

export function space<S extends { [k in keyof S]: SchemaNode }>(s: S): SpaceNode<S> {
  return { space: s };
}




type Data<N> = _Data<N, _Data<N, never>>

type _Data<N, TRoot, Ac = []> =
    N extends SpaceNode<infer I> ? (
      { [k in keyof I]: _Data<I[k], TRoot, [k, Ac]> }[keyof I]
    )
  : N extends DataNode<infer I> ? (
      [Read<I, $Root, TRoot>] extends [infer G]
        ? ([G] extends [never] ? never : [RenderPath<Ac>, G])
        : never
    )
  : never;


type Path<N, Ac = []> =
  '' | (
      N extends SpaceNode<infer I> ? { [k in keyof I]: RenderPath<Ac> | Path<I[k], [k, Ac]> }[keyof I]
    : N extends DataNode<any> ? RenderPath<Ac>
    : object extends N ? string
    : never
  );

type RenderPath<Ac> =
    Ac extends [string, never[]] ? Ac[0]
  : Ac extends [string, any[]] ? `${RenderPath<Ac[1]>}:${Ac[0]}`
  : never

type Arg<N, P> =
  _Arg<Data<N>, P>

type _Arg<D, P> =
    D extends [P, infer A] ? A
  : never;


const ww = specify(root =>
  space({
    hello: data(123 as const),

    recurse: data(['baa', root] as const)
  })
);

const www = ww
  .withContext('hello', x => ({ moo: 3 }))
  //.withContext('hello', x => ({}))

// www.debug.path
// www.debug.data
// www.debug.arg<'recurse'>()

type RRR = Merge<{moo:13,baa:1},{baa:2}>



type Head<R extends readonly unknown[]> =
    R extends readonly [] ? never
  : R extends readonly [infer H, ...any] ? H
  // : R extends readonly (infer E)[] ? E
  : never;

type Tail<R extends readonly any[]> =
    R extends readonly [] ? never
  : R extends readonly [any, ...infer T] ? Readonly<T>
  : R extends readonly [any] ? never
  : R extends readonly (infer E)[] ? readonly E[]
  : never;

export function head<R extends readonly any[]>(r: R): Head<R> {
  return <Head<R>>r[0];
}

export function tail<R extends readonly any[]>(r: R): Tail<R> {
  const [_, ...t] = r;
  return <Tail<R>><unknown>t;
}


type OnlyLast<R extends readonly unknown[]> =
    R extends readonly [] ? readonly []
  : R extends readonly [infer E] ? IfKnown<E, readonly [E]>
  : R extends readonly [any, ...infer T] ? OnlyLast<T>
  // : R extends readonly (infer E)[] ? readonly E[]
  : never;

function onlyLast<R extends readonly any[]>(r: R): OnlyLast<R> {
  if(r.length) return <OnlyLast<R>>([r[r.length - 1]] as const);
  else return <OnlyLast<R>>([] as const);
}

{
  type A = OnlyLast<readonly [1, 2, 3]>;
  type B = OnlyLast<readonly []>;
  type C = OnlyLast<readonly [1]>;
  type D = OnlyLast<number[]>;
  type _ = [A, B, C, D]

  const a = onlyLast([1, 2, 3] as const);
}





type AllButLast<R extends readonly any[]> =
    R extends readonly [] ? []
  : R extends readonly [any] ? []
  : R extends readonly [infer H, ...infer T] ? [H, ...AllButLast<T>]
  : R extends readonly (infer E)[] ? readonly E[]
  : never;

function allButLast<R extends readonly any[]>(r: R): AllButLast<R> {
  let ac = [];
  for(let i = 0; i < r.length - 1; i++) ac.push(r[i]) 
  return <AllButLast<R>><unknown>ac;
}

{
  type A = AllButLast<readonly [1, 2, 3]>;
  type B = AllButLast<readonly []>;
  type C = AllButLast<readonly [1]>;
  type D = AllButLast<number[]>;
  type _ = [A, B, C, D]

  const a = allButLast([1, 2, 3] as const);
}


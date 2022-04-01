import { FacNode, IfKnown } from "./facs";
import { Guard, Read } from "./guards/Guard";
import { isString, Merge, MergeMany, mergeObjects } from "./util";

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
  isValid?: boolean,
  payload?: any,
  handler?: (context: any, data: any) => Promise<any>
  summonContext?: () => any
}

export class Builder<N extends SchemaNode> {
  schema: N

  constructor(schema: N) {
    this.schema = schema;
  }

  withPhase<P extends Path<N>>(path: P, impl: (x:any,d:Arg<N,P>)=>Promise<Data<N>>): Builder<N> {
    return this;
  }

  withContext<P extends Path<N>, X>(path: P, fac: (context: PathContext<N,P>)=>X) {

    const nodes = effectiveNodes(this.schema, pathList(path));

    const verticals = extractFacNodes(allButLast(nodes))
    const horizontal = firstOr(extractFacNodes(onlyLast(nodes)), FacNode.root());

    return new Builder(mergeObjects(
      this.schema,
      {
        fac: FacNode.derive(
          [horizontal, ...verticals] as const,
          all => {
            const h2 = head(all)
            const t2 = tail(all)
            const context2 = mergeObjects(...t2, h2);
            const result2 = fac(<PathContext<N, P>><unknown>context2)
            return mergeObjects(h2, result2)
            //ultimately... output type of function depends entirely on 'fac'!
            //so threading types through achieves nothing?
            //no, it also depends on 'h'
            
            // const [h, ...vs] = all; 
            // const context = mergeObjects(...vs, h);
            // const result = fac(context);
            // return mergeObjects(h, result);
          })
      }
    ));
  }
  
  read(data: Data<N>): ReadResult {
    return match(this.schema, data);
  }

  readAny(data: any): ReadResult {
    return match(this.schema, data);
  }

  debug = {
    data: <Data<N>><unknown>undefined,
    path: <Path<N>><unknown>undefined,
    arg<P extends Path<N>>(): Arg<N, P> { throw 1; }
  }
}





const w = specify(root =>
  space({
    dog: space({
      bark: data(123)
    })
  }))
  .withContext('dog', u => ({ owns: ['bone'] as const }))
  .withContext('dog:bark', u => ({ articulations: ['woof'] as const }))

w.schema



const rrr = effectiveNodes(w.schema, pathList('dog:bark'));
rrr
  

type PPPP = Path<typeof w.schema>
type ____ = PPPP

type UUUU = EffectiveNodes<typeof w.schema, ['dog', 'bark']>
type ___ = UUUU


function getHorizontal<N, P extends Path<N>>(n: N, path: P) {
  const nodes = effectiveNodes(n, pathList(<Path<N>>path));

  // const verticals = extractProps(extractContexts(allButLast(nodes)), 'fac')
  return nodes;

  // const horizontal = firstOr(extractProps(extractContexts(onlyLast(nodes)), 'fac'), FacNode.root<{}>());
  // return horizontal;
}


const schema = {
  space: {
    cat: {
      space: {
        meeow: data(123)
      },
      fac: FacNode.root<{a:1}>()
    }
  }
};


const qqq = extractContextNodes(effectiveNodes(schema, pathList('cat:meeow')))
const _____ = qqq



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
      H extends { fac: FacNode<never, infer X> }
        ? readonly [X, ...ExtractFacContexts<T>]
        : ExtractFacContexts<T>
    )
  : R extends readonly (infer E)[] ? (
    E extends { fac: FacNode<never, infer X> }
        ? readonly X[]
        : readonly []
    )
  : never


type ExtractFacNodes<R extends readonly unknown[]> =
    R extends readonly [] ? readonly []
  : R extends readonly [infer E] ?
      IfKnown<E,
        [E] extends [ContextNode<infer I, infer O>]
          ? readonly [FacNode<I, O>]
          : readonly []
      >
  : R extends readonly [infer H, ...infer T] ?
      readonly [...ExtractFacNodes<readonly [H]>, ...ExtractFacNodes<T>]
  : never

function extractFacNodes<R extends readonly unknown[]>(r: R) : ExtractFacNodes<R> {
  throw 123
  // const ac = [];

  // for(let i = 0; i < r.length; i++) {
  //   const el = r[i];
  //   if(isContextNode(el)) ac.push(el);
  // }

  // return <ExtractContextNodes<R>><unknown>ac;
}


type ExtractContextNodes<R extends readonly unknown[]> =
    R extends readonly [] ? readonly []
  : R extends readonly [infer E] ?
      IfKnown<E,
        [E] extends [ContextNode<infer I, infer O>]
          ? readonly [E & ContextNode<I, O>]
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


// type Paths<S, P = []> =
//     S extends SpaceNode<infer I> ? { [k in keyof I]: RenderPath<P> | Paths<I[k], [k, P]> }[keyof I]
//   : S extends DataNode<any> ? RenderPath<P>
//   : never;



export function match(schema: SchemaNode, data: any): ReadResult {
  return _match(ReadMode.Resolving, schema, data);

  function _match(m: ReadMode, n: SchemaNode, d: any): ReadResult {
    if(!n) return _fail('no node mate');

    switch(m) {
      case ReadMode.Resolving:
        if(isSpaceNode(n)) {
          if(!Array.isArray(d)) return _fail('expected tuple');

          const [head, tail] = d;
          if(!isString(head)) return _fail('head should be indexer');

          return _match(m, n.space[head], tail);
        }

        if(isDataNode(n)) {
          return _match(ReadMode.Validating, n, d);
        }

        throw 'unexpected mode';

      case ReadMode.Validating:
        if(isDataNode(n)) {

          const isValid = Guard(n.data, (s, v) => {
            if(s === $root) {
              const result = match(schema, v);
              return result.isValid;
            }
          })(d);

          return {
            payload: d,
            isValid,
            errors: isValid ? [] : [`payload ${d} not valid within ${data}`],
          };
        }

        throw 'wrong mode for schema node';
      }

      return _fail(`unexpected schema node ${n}`);
    }

    function _fail(message: string): ReadResult {
      return {
        errors: [ message ],
      };
    }
  }

export function specify<S extends SchemaNode>(fn: (root: $Root)=>S) : Builder<S> {
  return new Builder(fn($root));
}


export type SchemaNode = {}
export type DataNode<D> = { data: D }
export type SpaceNode<I> = { space: I }
export type HandlerNode<H> = { handler: H }
export type ContextNode<R = never, X = unknown> = { fac: FacNode<R, X> }

function isDataNode(v: SchemaNode): v is DataNode<any> {
  return (<any>v).data;
}

function isSpaceNode(v: any): v is SpaceNode<any> {
  return (<any>v).space;
}

function isContextNode(v: any): v is ContextNode {
  return (<any>v).fac;
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

www.debug.path
www.debug.data
www.debug.arg<'recurse'>()

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

function head<R extends readonly any[]>(r: R): Head<R> {
  return <Head<R>>r[0];
}

function tail<R extends readonly any[]>(r: R): Tail<R> {
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


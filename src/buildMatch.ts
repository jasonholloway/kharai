import { FacNode } from "./facs";
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

    //todo: correct PathContext<N,P>
    //todo: find all upstream fac nodes
    
    const verticals = [
      FacNode.root<{ a: 1 }>(),
      FacNode.root<{ b: 2 }>()
    ] as const;

    const horizontal = FacNode.root<{ c: 3 }>();
    
    return new Builder(mergeObjects(
      this.schema,
      {
        fac: FacNode.derive(
          [horizontal, ...verticals] as const,
          all => {
            const [h, ...vs] = all; 
            const context = mergeObjects(...vs, h);
            const result = fac(context);
            return mergeObjects(h, result);
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
      woof: data(123)
    })
  }))
  .withContext('dog', u => ({ dog: 'woof' as const }))
  .withContext('dog:woof', u => ({ wolf: 'howl' as const }))

const rrr = effectiveNodes(w.schema, pathList('dog:woof'));
rrr
  

type PPPP = Path<typeof w.schema>
type ____ = PPPP

type UUUU = EffectiveNodes<typeof w.schema, ['dog', 'woof']>
type ___ = UUUU





//TODO test below...

type EffectiveNodes<N, PL extends PathList<string>> =
  ( PL extends readonly [] ? readonly [N]
  : string[] extends PL ? readonly SchemaNode[] 
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
    if(isSpace(node)) {
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
type YY = PathContext<N, 'dog:woof'>
type __ = YY




// but extensions upstream should be folded into new downstreams
// which is the source of the lattice
// so we don't just pluck off the final facNode, we run them all one-by-one and recombine them
// !!!

type PathContext<N, P extends Path<N>> =   
  MergeMany<ExtractContexts<ExtractProps<EffectiveNodes<N, PathList<P>>, 'fac'>>>




type ExtractContexts<R extends readonly unknown[]> =
  R extends readonly [infer H, ...infer T]
  ? (
    H extends FacNode<never, infer X>
      ? readonly [X, ...ExtractContexts<T>]
      : never
  )
  : readonly []

type ExtractProps<R extends readonly unknown[], P extends string> =
  R extends readonly [infer H, ...infer T]
    ? (
      P extends keyof H
        ? readonly [H[P], ...ExtractProps<T, P>]
        : ExtractProps<T, P>
    )
    : readonly []



function pathList<PS extends string>(ps: PS): PathList<PS> {
  return <PathList<PS>><unknown>ps.split(':');
}

type PathList<PS extends string> =
    PS extends '' ? readonly []
  : PS extends `${infer PHead}:${infer PTail}` ? readonly [PHead, ...PathList<PTail>]
  : string extends PS ? readonly string[]
  : readonly [PS];


type Paths<S, P = []> =
    S extends SpaceNode<infer I> ? { [k in keyof I]: RenderPath<P> | Paths<I[k], [k, P]> }[keyof I]
  : S extends DataNode<any> ? RenderPath<P>
  : never;



export function match(schema: SchemaNode, data: any): ReadResult {
  return _match(ReadMode.Resolving, schema, data);

  function _match(m: ReadMode, n: SchemaNode, d: any): ReadResult {
    if(!n) return _fail('no node mate');

    switch(m) {
      case ReadMode.Resolving:
        if(isSpace(n)) {
          if(!Array.isArray(d)) return _fail('expected tuple');

          const [head, tail] = d;
          if(!isString(head)) return _fail('head should be indexer');

          return _match(m, n.space[head], tail);
        }

        if(isData(n)) {
          return _match(ReadMode.Validating, n, d);
        }

        throw 'unexpected mode';

      case ReadMode.Validating:
        if(isData(n)) {

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
export type ContextNode = { fac: FacNode<any, any> }

function isData(v: SchemaNode): v is DataNode<any> {
  return (<any>v).data;
}

function isSpace(v: any): v is SpaceNode<any> {
  return (<any>v).space;
}

function isContext(v: any): v is ContextNode {
  return (<any>v).facs;
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
    N extends SpaceNode<infer I> ? { [k in keyof I]: RenderPath<Ac> | Path<I[k], [k, Ac]> }[keyof I]
  : N extends DataNode<any> ? RenderPath<Ac>
  : object extends N ? string
  : never;

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



type Head<R extends readonly any[]> =
    R extends readonly [] ? never
  : R extends readonly [infer H, ...any] ? H
  : R extends readonly (infer E)[] ? E
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

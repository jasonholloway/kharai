import { FacNode } from "./facs";
import { Guard, Read } from "./guards/Guard";
import { isString, Merge, mergeObjects } from "./util";

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

  withContext<P extends Path<N>, X>(path: P, fac: (upstream: PathContext<N,P>)=>X) {

    //find upstream here TODO
    const upper = FacNode.root<'meow'>();
    
    return new Builder(mergeObjects(
      this.schema,
      { facs: [...(isContext(this.schema) ? this.schema.facs : []), FacNode.derive([upper] as const, fac)] as const
    }));
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
  .withContext('dog:woof', u => ({ u, hello: 'woof' }))
  .withContext('dog:woof', u => ({ u, woof: 'howl' }))
  

//PATHCONTEXT DOESNT WORK
type N = typeof w.schema
type Y = PathContext<N, 'dog:woof'>
type __ = Y

type PathContext<N, P extends Paths<N>> =   
  Last<Flatten<ListProps<EffectiveNodes<N, PathList<P>>, 'facs'>>> extends FacNode<any, infer X>
    ? X
    : never;



  

type ListProps<R extends readonly unknown[], P extends string> =
  R extends readonly [infer H, ...infer T]
    ? (
      P extends keyof H
        ? readonly [H[P], ...ListProps<T, P>]
        : ListProps<T, P>
    )
    : readonly []

type Flatten<R> =
  R extends readonly [infer H, ...infer T] ? (
    H extends readonly unknown[]
      ? readonly [...Flatten<H>, ...Flatten<T>]
      : readonly [H, ...Flatten<T>]
    )
  : R;

type Last<R extends readonly unknown[]> =
    R extends readonly [infer N] ? N
  : R extends readonly [any, ...infer T] ? Last<T>
  : never;

type EffectiveNodes<N, PL extends readonly unknown[], Ac extends SchemaNode[] = []> =
  PL extends readonly [infer PHead, ...infer PTail]
    ? (
      N extends SpaceNode<infer I>
        ? (
          PHead extends keyof I
            ? EffectiveNodes<I[PHead], PTail, [...Ac, N]>
            : never
        )
        : never
    )
  : readonly [...Ac, N]

type PathList<PS extends string> =
  PS extends `${infer PHead}:${infer PTail}`
    ? [PHead, ...PathList<PTail>]
    : [PS]

type ListFilter<R extends readonly unknown[], F> =
  R extends readonly [infer H, ...infer T]
  ? (H extends F ? readonly [H, ...ListFilter<T, F>] : ListFilter<T, F>)
  : readonly [];

type Paths<S, P = []> =
    S extends SpaceNode<infer I> ? { [k in keyof I]: RenderPath<P> | Paths<I[k], [k, P]> }[keyof I]
  : S extends DataNode<any> ? RenderPath<P>
  : never;






type WithContext<N extends SchemaNode & object, P, X> =
    P extends [] ? Merge<N, { context: X }>
  : P extends [infer PHead, infer PTail] ? (
      N extends SpaceNode<infer NN> ? (
        {
          [k in keyof NN]:
            k extends PHead
              ? WithContext<NN[k], PTail, X>
              : NN[k]
        }
      )
      : never
    )
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
export type ContextNode = { facs: readonly FacNode<any, any>[]  }

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
  : never;

type RenderPath<Ac> =
    Ac extends [string, never[]] ? Ac[0]
  : Ac extends [string, any[]] ? `${RenderPath<Ac[1]>}:${Ac[0]}`
  : never;

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

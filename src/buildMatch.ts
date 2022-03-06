import { Guard, Read } from "./guards/Guard";
import { isString, Merge } from "./util";

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

  withContext<P extends Path<N>, X>(path: P, fac: (upstream:any)=>X): Builder<WithContext<N, ReadPath<P>, X>> {
    return this;
  }

  withPhase<P extends Path<N>>(path: P, impl: (x:any,d:Arg<N,P>)=>Promise<Data<N>>): Builder<N> {
    return this;
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


function withContext<N extends SchemaNode, P extends string>(node: N, path: P): WithContext<N, ReadPath<P>, {}> {
  throw 123
}


type WithContext<N extends SchemaNode & object, P, X> =
    P extends [] ? Merge<N, {context:X}>
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



type ReadPath<P extends string> =
    P extends `${infer H}:${infer T}` ? [H, ReadPath<T>]
  : P extends string ? [P, []]
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

enum SchemaType {
  Data,
  Space
}

export type SchemaNode = {}
export type DataNode<S> = SchemaNode & { data: S }
export type SpaceNode<S> = SchemaNode & { space: S }
export type HandlerNode<S> = SchemaNode & { handler: S }
export type ContextNode<S> = SchemaNode & { context: S }

function isData(v: SchemaNode): v is DataNode<any> {
  return (<any>v).data;
}

function isSpace(v: any): v is SpaceNode<any> {
  return (<any>v).space;
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




type PhasePath<N, Ac = []> =
    N extends SpaceNode<infer I> ? { [k in keyof I]: PhasePath<I[k], [k, Ac]> }[keyof I]
  : N extends DataNode<any> ? RenderPath<Ac>
  : never;


type PhaseContext<N, Ac = {}> =
  any








type RenderPath<Ac> =
    Ac extends [string, never[]] ? Ac[0]
  : Ac extends [string, any[]] ? `${RenderPath<Ac[1]>}:${Ac[0]}`
  : never;

type Arg<N, P> =
  _Arg<Data<N>, P>

type _Arg<D, P> =
    D extends [P, infer A] ? A
  : never;


const w = specify(root =>
  space({
    hello: data(123 as const),

    recurse: data(['baa', root] as const)
  })
);

w.withContext('hello', x => ({ moo: 3 }))

w.debug.path
w.debug.data
w.debug.arg<'recurse'>()

type RRR = Merge<{moo:13,baa:1},{baa:2}>

import { FacNode } from "../facs";
import { Guard, Read } from "../guards/Guard";
import { isString } from "../util";

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
  payload?: any
}

export class Builder<S extends SchemaNode, C = Contracts<S, Contracts<S>>, P extends Paths<S> = Paths<S>> {
  contract: C
  schema: S

  constructor(schema: S) {
    this.contract = <C><unknown>undefined;
    this.schema = schema;
  }

  withContext<PP extends P, X>(path: PP, fac: (upstream: PathContext<S,PP>)=>X) {
    //need to derive current context from path
    //...

    // and even then, there might be multiple upstreams, somehow
    // there's the root, at the top
    // and as we find more FacNodes in the tree
    // we accumulate their types
    //
    // each SchemaNode can have an associated FacNode
    // or rather, an array of FacNodes
    // each FacNode builds on the previous one, and only makes available whatever its factory allows
    // therefore we simplify, and it is up to us to merge results
    //


    // BELOW
    // the types need accumulating, then the actual impl to match it
    //
    
    return new Builder(Object.assign(this.schema, { facNodes: [FacNode.root<'hello'>(), FacNode.root<'boo'>()] as const }));
  }

  withPhase<PP extends P>(path: PP, impl: (x:any,d:PhaseDataShape<C, P>)=>Promise<C>): Builder<S, C, P> {
    return this;
  }
  
  read(data: C): ReadResult {
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

function match(schema: SchemaNode, data: any): ReadResult {
  return _match(ReadMode.Resolving, schema, data);

  function _match(m: ReadMode, n: SchemaNode, d: any): ReadResult {
      if(!n) return fail('no node mate');

      switch(m) {
        case ReadMode.Resolving:
          if(isSpace(n)) {
            if(!Array.isArray(data)) return fail('expected tuple');

            const [head, tail] = data;
            if(!isString(head)) return fail('head should be indexer');
            
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
            })(data);

            return {
              payload: data,
              isValid,
              errors: isValid ? [] : [`payload not valid: ${data}`]
            };
          }

          throw 'wrong mode for schema node';
      }

      return fail(`unexpected schema node ${n}`);


      function fail(message: string): ReadResult {
        return {
          errors: [ message ],
        };
      }
    }
  }

type RootContext = {}

export function specify<S extends SchemaNode>(fn: (root: $Root)=>S) : Builder<S, RootContext> {
  return new Builder(fn($root));
}

enum SchemaType {
  Data,
  Space
}

export type SchemaNode = {}
export type DataNode<S> = SchemaNode & { data: S }
export type SpaceNode<S> = SchemaNode & { space: S }
export type ContextNode = SchemaNode & { facNodes: FacNode<any, any>[]  }

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





type PathContext<N, P extends Paths<N>> =   
  TryGetProp<Last<ListFilter<EffectiveNodes<N, PathList<P>>, ContextNode>>, 'facNodes'>





type TryGetProp<O, P extends string> =
  P extends keyof O ? O[P]
  : never

  


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


const w = specify(root =>
  space({
    dog: space({
      woof: data(123)
    })
  }))
  .withContext('dog:woof', u => ({ u, hello: 'woof' }))
  .withContext('dog:woof', u => ({ u, woof: 'howl' }))
  

type S = typeof w.schema
type Y = PathContext<S, 'dog:woof'>
type __ = Y














type Contracts<T, TRoot = any, P = []> =
    T extends SpaceNode<infer I> ? { [k in keyof I]: Contracts<I[k], TRoot, [k, P]> }[keyof I]
  : T extends DataNode<infer I> ? [RenderPath<P>, Read<I, $Root, TRoot>]
  : never;

type Paths<S, P = []> =
    S extends SpaceNode<infer I> ? { [k in keyof I]: RenderPath<P> | Paths<I[k], [k, P]> }[keyof I]
  : S extends DataNode<any> ? RenderPath<P>
  : never;

type PhasePaths<S, P = []> =
    S extends SpaceNode<infer I> ? { [k in keyof I]: PhasePaths<I[k], [k, P]> }[keyof I]
  : S extends DataNode<any> ? RenderPath<P>
  : never;

type RenderPath<P> =
    P extends [string, never[]] ? P[0]
  : P extends [string, any[]] ? `${RenderPath<P[1]>}:${P[0]}`
  : never;

type PhaseDataShape<C, RP> =
	C extends [RP, infer D] ? D
  : never;



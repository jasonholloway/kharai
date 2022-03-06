import { Schema } from "inspector";
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

export class Builder<S extends SchemaNode, C = Contracts<S, Contracts<S>>, P = Paths<S>> {
  contract: C
  schema: S

  constructor(schema: S) {
    this.contract = <C><unknown>undefined;
    this.schema = schema;
  }

  withContext<PP extends P, X>(path: PP, fac: (upstream:any)=>X): Builder<S, C, P> {
    return this;
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



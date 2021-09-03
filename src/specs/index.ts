import { isArray } from "util";
import { Guard, Read } from "../guards/Guard";

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

export function specify<S extends SchemaNode>(fn: (root: $Root)=>S) {

  const schema = fn($root);
  type DataShape = Contracts<S, Contracts<S>>;
  
  return {
    schema,
    read(data: DataShape) {
      return _read(schema, data);
    },
    readAny(data: any): ReadResult {
      return _read(schema, data);
    },
    contract: <DataShape>undefined,

    withContext<P extends AllPaths<S>, X>(path: P, fac: (upstream:any)=>X) {

      //given P, need to walk through nodes accumulating context

      
      return this;
    },

    withPhase<P extends PhasePaths<S>>(path: P, impl: (x:any,d:any)=>Promise<DataShape>) {
      return this;
    }
  };


  function _read(n: SchemaNode, data: any): ReadResult {
    let mode: ReadMode = ReadMode.Resolving;
    return step();

    function step(): ReadResult {

      if(!n) return fail('no node mate');

      switch(mode) {
        case ReadMode.Resolving:
          if(isSpace(n)) {
            if(!isArray(data)) return fail('expected tuple');

            const [head, tail] = data;
            n = n.schema[head];
            data = tail;
            return step();
          }

          if(isData(n)) {
            mode = ReadMode.Validating;
            return step();
          }

          throw 'unexpected mode';

        case ReadMode.Validating:
          if(isData(n)) {
            
            const isValid = Guard(n.schema, (s, v) => {
              if(s === $root) {
                const result = _read(schema, v);
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
}


enum SchemaType {
  Data,
  Space
}

export type SchemaNode = { _type: SchemaType }
export type Data<X, S> = { _type: SchemaType.Data, schema: S }
export type Space<X, S> = { _type: SchemaType.Space, schema: S }

export function data<S>(s: S): Data<any, S> {
  return {
    _type: SchemaType.Data,
    schema: s
  };
}

export function space<S extends { [k in keyof S]: SchemaNode }>(s: S): Space<any, S> {
  return {
    _type: SchemaType.Space,
    schema: s
  };
}

function isData(v: SchemaNode): v is Data<any, any> {
  return v._type === SchemaType.Data;
}

function isSpace(v: SchemaNode): v is Space<any, any> {
  return v._type === SchemaType.Space;
}


type Contracts<T, TRoot = any, P = []> =
    T extends Space<any, infer I> ? { [k in keyof I]: Contracts<I[k], TRoot, [k, P]> }[keyof I]
  : T extends Data<any, infer I> ? [RenderPath<P>, Read<I, $Root, TRoot>]
  : never;



type AllPaths<S, P = []> =
    S extends Space<any, infer I> ? { [k in keyof I]: RenderPath<P> | AllPaths<I[k], [k, P]> }[keyof I]
  : S extends Data<any, any> ? RenderPath<P>
  : never;

type PhasePaths<S, P = []> =
    S extends Space<any, infer I> ? { [k in keyof I]: PhasePaths<I[k], [k, P]> }[keyof I]
  : S extends Data<any, any> ? RenderPath<P>
  : never;

type RenderPath<P> =
    P extends [string, never[]] ? P[0]
  : P extends [string, any[]] ? `${RenderPath<P[1]>}:${P[0]}`
  : never;



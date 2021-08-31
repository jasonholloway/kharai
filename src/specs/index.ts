import { isArray } from "util";
import { Guard } from "../guards/Guard";

const $root = Symbol('root');
type $Root = typeof $root;


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
  
  return {
    read(data: any): ReadResult {
      return _read(schema, data);
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







type Shapify<T, TPath = [], TRoot = any> =
    T extends Space<infer S> ? ShapifySpace<S, TPath, TRoot>
  : T extends Data<infer S> ? ShapifyData<S, TPath, TRoot>
  : never

type ShapifySpace<T, TPath, TRoot> =
  T extends object
    ? { [k in keyof T]: [k, Shapify<T[k], [TPath, k], TRoot>] }[keyof T]
    : never

type ShapifyData<T, TPath, TRoot> =
  T
  //as well as actual T, should interpret lazy guards
  



enum SchemaType {
  Data,
  Space
}

type SchemaNode = { _type: SchemaType }
type Data<S> = { _type: SchemaType.Data, schema: S }
type Space<S> = { _type: SchemaType.Space, schema: S }

export function data<S>(s: S): Data<S> {
  return {
    _type: SchemaType.Data,
    schema: s
  };
}

export function space<S extends { [k in keyof S]: SchemaNode }>(s: S): Space<S> {
  return {
    _type: SchemaType.Space,
    schema: s
  };
}

function isData(v: SchemaNode): v is Data<any> {
  return v._type === SchemaType.Data;
}

function isSpace(v: SchemaNode): v is Space<any> {
  return v._type === SchemaType.Space;
}


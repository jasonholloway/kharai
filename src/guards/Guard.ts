import { isArray, isBoolean, isFunction, isNumber, isObject, isRegExp, isString } from "util"
import { inspect } from 'util'
const $inspect = Symbol.for('nodejs.util.inspect.custom');

const log = (x: any) => console.log(inspect(x), { depth: 5 })

export const Any = Symbol('Any');
export const Num = Symbol('Num');
export const Bool = Symbol('Bool');
export const Str = Symbol('Str');
export const Never = Symbol('Never');

const $many = Symbol('Many');
type Many<V> = {
  _type: typeof $many,
  inner: V,
  [$inspect](): string
}


export function Many<V>(m: V) : Many<V> {
  return {
    _type: $many,
    inner: m,
    [$inspect]() { return `${inspect(m)}[]` }
  };
}



type Read<S> =
    S extends typeof Any ? any
  : S extends typeof Num ? number
  : S extends typeof Str ? string
  : S extends typeof Bool ? boolean
  : S extends typeof Never ? never
  : S extends Many<infer V> ? Read<V>[]
  : S extends (v:any) => v is (infer V) ? V
  : S extends RegExp ? string
  : S extends string ? S
  : S extends number ? S
  : S extends boolean ? S
  : S extends readonly any[] ? ({ -readonly [I in keyof S]: Read<S[I]> })
  : S extends object ? ({ -readonly [I in keyof S]: Read<S[I]> })
  : S;
  // : never

export const Guard = <S>(s: S, cb?: ((s:any,v:any)=>undefined|boolean)) => Object.assign(
  (v: any): v is Read<S> => match(s, v, cb),
  {
    match: (v: Read<S>) => match(s, v, cb),
    to<V extends Read<S>>() { return <(v:any) => v is V><unknown>this; }
  });


export function match(s: any, v: any, cb?: ((s:any,v:any)=>undefined|boolean)): boolean {

  if(cb) {
    const r = cb(s, v);
    if(r !== undefined) return r;
  }

  if(s === undefined) {
    return v === undefined;
  }

  if(isString(s) || isNumber(s) || isBoolean(s)) {
    return s === v;
  }

  if(isRegExp(s)) {
    if(isString(v)) return s.test(v);
    if(isRegExp(v)) return s.source == v.source;
    return false;
  }

  if(isMany(s) && isArray(v)) {
    return v.every(vv => match(s.inner, vv));
  }

  if(isArray(s) && isArray(v)) {
    if(!s.length) {
      return !v.length;
    }

    const [ sHead, ...sTail ] = s;
    const [ vHead, ...vTail ] = v;

    const head = match(sHead, vHead, cb);
    const tail = match(sTail, vTail, cb);

    return head && tail;
  }

  if(isFunction(s)) {
    return s(v);
  }

  if(isObject(s) && isObject(v)) {
    for(const [sk, sv] of Object.entries(s)) {
      const r = match(sv, v[sk], cb);
      if(!r) return false;
    }
    
    return true;
  }

  switch(s) {
    case Str: return isString(v);
    case Num: return isNumber(v);
    case Bool: return isBoolean(v);
  }
  
  return false;
}

function isMany(v: any): v is Many<any> {
  return v._type === $many;
}

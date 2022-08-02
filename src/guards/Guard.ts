import { isArray, isBoolean, isFunction, isNumber, isObject, isRegExp, isString } from "util"
import { inspect } from 'util'
const $inspect = Symbol.for('nodejs.util.inspect.custom');

const log = (x: any) => console.log(inspect(x), { depth: 5 })

export const Any = Symbol('Any');
export const Num = Symbol('Num');
export const Bool = Symbol('Bool');
export const Str = Symbol('Str');
export const Never = Symbol('Never');



export const $and = Symbol('And');

type And<A,B> = {
  _type: typeof $and,
  a: A,
  b: B
}

export function And<A,B>(a:A, b:B): And<A,B> {
  return <And<A,B>>{
    _type: $and,
    a,
    b
  };
}


export const $or = Symbol('Or');

type Or<A,B> = {
  _type: typeof $or,
  a: A,
  b: B
}

export function Or<A,B>(a:A, b:B): Or<A,B> {
  return <Or<A,B>>{
    _type: $or,
    a,
    b
  };
}


export const $many = Symbol('Many');

type Many<V> = {
  _type: typeof $many,
  inner: V
}

export function Many<V>(m: V) : Many<V> {
  return <Many<V>>{
    _type: $many,
    inner: m,
    [$inspect]() { return `${inspect(m)}[]` }
  };
}



export type Read<S, X=never, Y=never> =
    S extends X ? Y
  : S extends typeof Any ? any
  : S extends typeof Num ? number
  : S extends typeof Str ? string
  : S extends typeof Bool ? boolean
  : S extends typeof Never ? never
  : S extends And<infer A, infer B> ? Read<A, X, Y> & Read<B, X, Y> 
  : S extends Or<infer A, infer B> ? Read<A, X, Y> | Read<B, X, Y> 
  : S extends Many<infer V> ? Read<V, X, Y>[]
  : S extends (v:any) => v is (infer V) ? V
  : S extends RegExp ? string
  : S extends string ? S
  : S extends number ? S
  : S extends boolean ? S
  : S extends readonly any[] ? ({ -readonly [I in keyof S]: Read<S[I], X, Y> })
  : S extends object ? ({ -readonly [I in keyof S]: Read<S[I], X, Y> })
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

  if(isAnd(s)) {
    return match(s.a, v, cb) && match(s.b, v, cb);
  }

  if(isOr(s)) {
    return match(s.a, v, cb) || match(s.b, v, cb);
  }

  if(isMany(s) && isArray(v)) {
    return v.every(vv => match(s.inner, vv, cb));
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
    case Any: return true;
    case Str: return isString(v);
    case Num: return isNumber(v);
    case Bool: return isBoolean(v);
  }
  
  return false;
}

function isAnd(v: any): v is And<unknown, unknown> {
  return v._type === $and;
}

function isOr(v: any): v is Or<unknown, unknown> {
  return v._type === $or;
}

function isMany(v: any): v is Many<any> {
  return v._type === $many;
}

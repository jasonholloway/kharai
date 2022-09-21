import { isArray, isBoolean, isFunction, isNumber, isObject, isRegExp, isString } from "util"
import { inspect } from 'util'
const $inspect = Symbol.for('nodejs.util.inspect.custom');

const log = (x: any) => console.log(inspect(x), { depth: 5 })

const $typ = Symbol('Typ');

export class Typ<Tag> {
  readonly sym = $typ;
  readonly tag: Tag

  constructor(tag: Tag) {
    this.tag = tag;
  }
}

const tup = <R extends unknown[]>(...r:R) => r;


export const Any = new Typ('any' as const);
export const Num = new Typ('num' as const);
export const Bool = new Typ('bool' as const);
export const Str = new Typ('str' as const);
export const Never = new Typ('never' as const);

export function And<A,B>(a:A, b:B) {
  return new Typ(tup('and' as const, tup(a,b)));
}

export function Or<A,B>(a:A, b:B) {
  return new Typ(tup('or' as const, tup(a,b)));
}

export function Many<V>(m:V) {
  return new Typ(tup('many' as const, m));
}

export function Tup<R extends unknown[]>(...r: R) : R {
  return r;
}


export type Read<S, X=never, Y=never> =
    S extends X ? Y
  : S extends Typ<infer Tag> ? (
        Tag extends 'any' ? any
      : Tag extends 'num' ? number
      : Tag extends 'bool' ? boolean
      : Tag extends 'str' ? string
      : Tag extends 'never' ? never
      : Tag extends [infer Tag2, infer Arg] ? (
            Tag2 extends 'and' ? (
              Arg extends [infer A, infer B]
                ? Read<A,X,Y> & Read<B,X,Y> : never
            )
          : Tag2 extends 'or' ? (
              Arg extends [infer A, infer B]
                ? Read<A,X,Y> | Read<B,X,Y> : never
            )
          : Tag2 extends 'many' ? (
              Read<Arg, X, Y>[]
            )
          : never
        )
      : never
    )
  : S extends (v:any) => v is (infer V) ? V
  : S extends RegExp ? string
  : S extends string ? S
  : S extends number ? S
  : S extends boolean ? S
  : S extends readonly any[] ? ({ -readonly [I in keyof S]: Read<S[I], X, Y> })
  : S extends object ? ({ -readonly [I in keyof S]: Read<S[I], X, Y> })
  : S;
  // : never

export type Guard<T> = (v:unknown) => v is T;

export function Guard<S>(s: S, cb?: ((s:any,v:any)=>undefined|boolean)) {
  return Object.assign(
  (v: any): v is Read<S> => match(s, v, cb),
  {
    match: (v: Read<S>) => match(s, v, cb),
    to<V extends Read<S>>() { return <(v:any) => v is V><unknown>this; }
  });
}


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
    const [a,b] = s.tag[1];
    return match(a, v, cb) && match(b, v, cb);
  }

  if(isOr(s)) {
    const [a,b] = s.tag[1];
    return match(a, v, cb) || match(b, v, cb);
  }

  if(isMany(s) && isArray(v)) {
    return v.every(vv => match(s.tag[1], vv, cb));
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

  if(isTyp(s)) {
    switch(s.tag) {
      case Any.tag: return true;
      case Str.tag: return isString(v);
      case Num.tag: return isNumber(v);
      case Bool.tag: return isBoolean(v);
      default: return false;
    }
  }

  if(isObject(s) && isObject(v)) {
    for(const [sk, sv] of Object.entries(s)) {
      const r = match(sv, v[sk], cb);
      if(!r) return false;
    }
    
    return true;
  }
  
  return false;
}


function isTyp(v: unknown): v is Typ<unknown> {
  return (<{sym:unknown}>v).sym === $typ;
}

function isAnd(v: unknown): v is Typ<['and', [unknown, unknown]]> {
  return isTyp(v) && isArray(v.tag) && v.tag[0] === 'and';
}

function isOr(v: unknown): v is Typ<['or', [unknown, unknown]]> {
  return isTyp(v) && isArray(v.tag) && v.tag[0] === 'or';
}

function isMany(v: unknown): v is Typ<['many', unknown]> {
  return isTyp(v) && isArray(v.tag) && v.tag[0] === 'many';
}

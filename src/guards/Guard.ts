import { isArray, isBoolean, isFunction, isNumber, isObject, isRegExp, isString } from "util"
import { inspect } from 'util'

const $inspect = Symbol.for('nodejs.util.inspect.custom');
const log = (x: any) => console.log(inspect(x), { depth: 5 })

export type Narrowable = string | number | boolean | symbol | object | undefined | void | null | {};
const tup = <R extends Narrowable[]>(...r: R) => r;

const $typ = Symbol('Typ');

export class Typ<Tag> {
  readonly t: Tag

  constructor(tag: Tag) {
    this.t = tag;
  }
}


export const Any = new Typ('any' as const);
export const Num = new Typ('num' as const);
export const Bool = new Typ('bool' as const);
export const Str = new Typ('str' as const);
export const Never = new Typ('never' as const);

export function And<R extends Narrowable[]>(...r: R) {
  return new Typ(tup('and', r));
}

export function Or<R extends Narrowable[]>(...r: R) {
  return new Typ(tup('or', r));
}

export function Many<V extends Narrowable>(m:V) {
  return new Typ(tup('many', m));
}

export function Tup<R extends Narrowable[]>(...r: R) : R {
  return r;
}

export function Dict<V extends Narrowable>(v:V) {
  return new Typ(tup('dict', v));
}

export type PreExpand<S, X=never, Y=never> =
    S extends X ?                                                   Y
  : S extends number|string|boolean|RegExp|((v:unknown)=>unknown) ? S
  : S extends Typ<[infer Tag2, infer Arg]> ?                        Typ<[Tag2, PreExpand<Arg,X,Y>]>
  : S extends readonly unknown[] ?                                  { -readonly [I in keyof S]: PreExpand<S[I],X,Y> }
  : S extends object ?                                              { -readonly [I in keyof S]: PreExpand<S[I],X,Y> }
  : S
;

export type ReadExpand<S, X=never, Y=never> =
  Read<PreExpand<S,X,Y>>
;

export type Read<S> =
  S extends Typ<infer Tag> ? (
        Tag extends 'any' ? any
      : Tag extends 'num' ? number
      : Tag extends 'bool' ? boolean
      : Tag extends 'str' ? string
      : Tag extends 'never' ? never
      : Tag extends [infer Tag2, infer Arg] ? (
            //TODO below to be worked through tuple-wise
            Tag2 extends 'and' ? (
              _ReadAnd<Arg>
            )
          : Tag2 extends 'or' ? (
              _ReadOr<Arg>
            )
          : Tag2 extends 'many' ? (
              Read<Arg>[]
            )
          : Tag2 extends 'dict' ? (
              { [k:string]: Read<Arg> }
            )
          : never
        )
      : never
    )
  : S extends (v:any) => v is (infer V) ? V
  : S extends RegExp ? string
  : S extends string|number|boolean ? S
  : S extends readonly any[] ? ({ -readonly [I in keyof S]: Read<S[I]> })
  : S extends object ? ({ -readonly [I in keyof S]: Read<S[I]> })
  : S
;

type _ReadAnd<R> =
  R extends [infer H, ...infer T] ?
  T extends unknown[] ?
    Read<H> & _ReadAnd<T>
  : never : unknown
;

type _ReadOr<R> =
  R extends [infer H, ...infer T] ?
  T extends unknown[] ?
    Read<H> | _ReadOr<T>
  : never : never
;


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
    for(const ts of s.t[1]) {
      if(!match(ts, v)) return false;
    }

    return true;
  }

  if(isOr(s)) {
    for(const ts of s.t[1]) {
      if(match(ts, v)) return true;
    }

    return false;
  }

  if(isMany(s) && isArray(v)) {
    return v.every(vv => match(s.t[1], vv, cb));
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

  if(isDict(s)) {
    return !!v
      && typeof v === 'object'
      && Object.getOwnPropertyNames(v)
        .every(p => match(s.t[1], v[p]));
  }

  if(isTyp(s)) {
    switch(s.t) {
      case Any.t: return true;
      case Str.t: return isString(v);
      case Num.t: return isNumber(v);
      case Bool.t: return isBoolean(v);
      default: return false;
    }
  }

  if(isObject(s) && isObject(v)) {
    for(const [sk, sv] of Object.entries(s)) {
      if(!match(sv, v[sk], cb)) return false;
    }
    
    return true;
  }
  
  return false;
}


function isTyp(v: unknown): v is Typ<unknown> {
  return v instanceof Typ;//  (<{sym:unknown}>v).sym === $typ;
}

function isAnd(v: unknown): v is Typ<['and', unknown[]]> {
  return isTyp(v) && isArray(v.t) && v.t[0] === 'and';
}

function isOr(v: unknown): v is Typ<['or', unknown[]]> {
  return isTyp(v) && isArray(v.t) && v.t[0] === 'or';
}

function isMany(v: unknown): v is Typ<['many', unknown]> {
  return isTyp(v) && isArray(v.t) && v.t[0] === 'many';
}

function isDict(v: unknown): v is Typ<['dict', unknown]> {
  return isTyp(v) && isArray(v.t) && v.t[0] === 'dict';
}

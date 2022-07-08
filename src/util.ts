import { isArray } from 'util'
import { List } from 'immutable'

export const peek = <V>(tag: string, lens?: (v: V) => any) => (v: V) => {
    console.log(tag, lens ? lens(v) : v)
    return v;
}

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const promisify = <X>(x: X | Promise<X>) =>
    isPromise(x) ? x : Promise.resolve(x);

export const isString = (v: any): v is string =>
    typeof v === 'string';

export const isPromise = (x: any): x is Promise<any> =>
    x.then && x.catch;

export const clone = <X>(x: X): X => 
    JSON.parse(JSON.stringify(x));

export const isTuple2 = <A, B>(v: any): v is readonly [A, B] =>
    isArray(v) && v.length == 2;

// export const lift = <V>(v: V|undefined) => (v ? [v] : []);

export async function collect<V>(gen: AsyncIterable<V>): Promise<List<V>> {
	const collected: V[] = [];
	for await (let val of gen) collected.push(val);
	return List(collected)
}

export type RO<T> =
  T extends any[] ? { readonly [K in keyof T]: RO<T[K]> } :
  T 

export type MergeMany<R extends readonly unknown[]> =
  R extends readonly [infer H, ...infer T]
  ? Merge<H, MergeMany<T>>
  : unknown

export type Merge<A, B> =
  [A,B] extends [unknown[], unknown[]] ? (
      A extends unknown[] ?
      B extends unknown[] ?
      MergeTupsAndArrays<A,B>
      : never : never
  )
  : [A,B] extends [object,object] ? (
      A extends object ?
      B extends object ?
      MergeObjects<A,B>
      : never : never
  )
  : A & B;

// below is bit ropey
// eg number[] and [1,2] should merge to [1,2]
// as the only result that satisfies both
type MergeTupsAndArrays<A extends unknown[], B extends unknown[]> =
    A extends readonly [] ? B
  : B extends readonly [] ? A
  : ( A extends readonly [infer AH, ...infer AT] ?
      B extends readonly [infer BH, ...infer BT] ?
      readonly [Merge<AH,BH>, ...MergeTupsAndArrays<AT,BT>]
      : MergeArrays<A,B> : MergeArrays<A,B>
    );

type MergeArrays<A extends unknown[], B extends unknown[]> =
  A extends (infer AT)[] ?
  B extends (infer BT)[] ?
  readonly (AT|BT)[]
  : never : never;


type MergeObjects<A extends object, B extends object> =
  Simplify<Omit<A, keyof B> & B>;
  

{
  type A = Merge<{a:1},{b:2}>
  type B = Merge<[1], [1,2]>
  type C = Merge<1[], number[]>
  type D = Merge<number[], [1,2]>

  type _ = [A,B,C,D]
}


export type Simplify<T> =
  T extends readonly unknown[] ? SimplifyArray<T>
  : { [k in keyof T]: T[k] };

type SimplifyArray<R extends readonly unknown[]> =
  R extends [infer Head, ...infer Tail]
  ? [Simplify<Head>, ...SimplifyArray<Tail>]
  : [...R];

export function merge<A, B>(a: A, b: B) : Merge<A, B> {
  return <Merge<A, B>>Object.assign({}, a, b);
}

export function mergeObjects<R extends unknown[]>(...r: R) {
  return <MergeMany<R>>Object.assign({}, ...r);
}


export type DeepMerge<A,B> =
  [A,B] extends [object,object] ?
    Merge<A, {
      [k in keyof B]:
        k extends keyof A
          ? DeepMerge<A[k],B[k]>
          : B[k]
    }>
  : A&B;

{
  type A = DeepMerge<{},{}>
  type B = DeepMerge<{a:1, c:{ z:9 }},{a:number,b:2,c:{y:3}}>
  type C = DeepMerge<{a:1, c:{ z:9 }},{a:number,b:2,c:{z:3}}>
  type D = DeepMerge<{a:[1]},{a:[number]}>

  type _ = [A,B,C,D]
}


type _MergeDeep<A, B> =
  { [k in keyof A | keyof B]:
    k extends keyof B ? (
      k extends keyof A ? (
        MergeDeep<A[k], B[k]>
      )
      : B[k]
    )
    : (k extends keyof A ? A[k] : never)
  }

export type MergeDeep<A, B> = Simplify<_MergeDeep<A, B>>

export function mergeDeep<A, B>(a: A, b: B) : MergeDeep<A, B> {
  if(b === undefined) return <MergeDeep<A, B>><unknown>a;
  if(a === undefined) return <MergeDeep<A, B>><unknown>b;
  
  const bns = List(Object.getOwnPropertyNames(b));

  return <MergeDeep<A, B>>bns.reduce((ac, pn) => merge(ac, { [pn]: mergeDeep<unknown, unknown>((<any>ac)[pn], <unknown>(<any>b)[pn]) }), <unknown>a);
}

{
  type A = MergeDeep<{}, { a:1 }>
  type B = MergeDeep<{ a: { moo: 1 }, b: {} }, { a: { baa: 2 } }>

  type _ = [A, B]
}





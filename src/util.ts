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
  A extends object
    ? (B extends object
        ? Simplify<Omit<A, keyof B> & B>
        : A & B)
    : A & B;

export type Simplify<T> = T extends infer O ? { [k in keyof O]: O[k] } : never;



export function mergeObjects<R extends unknown[]>(...r: R) {
  return <MergeMany<R>>Object.assign({}, ...r);
}


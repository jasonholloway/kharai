import { isArray } from 'util'

export const peek = <V>(tag: string, lens?: (v: V) => any) => (v: V) => {
    console.log(tag, lens ? lens(v) : v)
    return v;
}

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const promisify = <X>(x: X | Promise<X>) =>
    isPromise(x) ? x : Promise.resolve(x);

export const isPromise = (x: any): x is Promise<any> =>
    x.then && x.catch;

export const clone = <X>(x: X): X => 
    JSON.parse(JSON.stringify(x));

export const isTuple2 = <A, B>(v: any): v is readonly [A, B] =>
    isArray(v) && v.length == 2;

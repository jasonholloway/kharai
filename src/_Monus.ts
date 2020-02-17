import _Monoid from './_Monoid'

export default interface _Monus<V> extends _Monoid<V> {
	subtract(a: V, b: V): V
}


export class NumberMonus implements _Monus<number> {
	zero: number = 0;

  add(a: number, b: number): number {
		return a + b;
  }

  subtract(a: number, b: number): number {
    return a - b;
  }
}

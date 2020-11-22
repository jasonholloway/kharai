
export default interface _Monoid<V> {
	zero: V
	add(a: V, b: V): V
}

export class _MonoidNumber implements _Monoid<number> {
  zero: number = 0;
  add(a: number, b: number): number {
		return a + b;
  }
}

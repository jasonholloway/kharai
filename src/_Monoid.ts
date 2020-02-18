
export default interface _Monoid<V> {
	zero: V
	add(a: V, b: V): V
}


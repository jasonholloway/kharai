declare module 'flatqueue' {
    export default class FlatQueue<V> {
        constructor()
        push(i: number, v: V): void
        peek(): number
        peekValue(): V
        pop(): number
        length: number
    }
}
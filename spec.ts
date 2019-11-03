
export type Context = { version: Readonly<number>,  data: any }

type Next<P> = P | [P, number]
type Behaviour<P> = (x: Context) => Next<P> | Promise<Next<P>>

function specify<S extends { [key: string]: Behaviour<keyof S> }>(s: S) {
    return { 
        match: (phase?: string) => s[phase || '']
     };
}

export default specify({
    start() {
        return 'loop'
    },

    downloadCsv(x) {
        throw Error();
    },

    loop(x) {
        return ['start', 1000]
    },

    error() {
        throw Error();
    }
})
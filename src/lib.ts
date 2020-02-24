import { Map } from 'immutable'
import { RO } from './util'
import { Attendee, Convener } from './Mediator'


export type Data = Map<string, any>


// export type MachineState<W extends World = World, M extends Machine<W> = Machine<W>> = {
// 	data: any
// 	resume: Command
// }


export type Id = string

// export type Machine<W extends World, K extends MachineKey<W> = MachineKey<W>> = W['machines'][K]
// export type Phase<W extends World, M extends Machine<W>, K extends PhaseKey<M> = PhaseKey<M>> = M[K]


// export type Command<H extends string = string, T extends any[] = any[]> = RO<Cons<H, T>> //<K extends string = string> = RO<[K, ...any[]]>
// export type Yield<O extends Command = Command> = Promise<RO<O[]>>

export type Keyed<T> = { [key: string]: T }
export type Keys<O> = keyof O & string;


export type MachineSpec = Keyed<PhaseSpec>

export type PhaseSpec = {
	input: any
}

type PathVal<T, E> = { [K in keyof T]: [K, T[K] extends E ? T[K] : PathVal<T[K], E>] }[keyof T]

type _Phase<P> = PathVal<P, any[]>

export type Phase<W extends World> = _Phase<W['phases']>

// export type Cmd<W extends World, MK extends MachineKey<W> = MachineKey<W>> =
// 		readonly ['@me', PhaseKey<Machine<W, MK>>]
// 	| readonly [MK, PhaseKey<Machine<W, MK>>]
//   | { [HK in keyof W['handlers']]: Cons<HK, W['handlers'][HK]> }[keyof W['handlers'] & string]


export interface RunContext {
	attach<R>(attend: Attendee<R>): Promise<false|[R]>
	convene<R>(ids: Id[], convener: Convener<R>): Promise<R>
}

export type PhaseMap = {
	[k: string]: PhaseMap | any[]
}

export type World = {
	context: RunContext
	phases: PhaseMap
}

//in combining available phases, we don't just want Phase<W>, but phases on all intermediate PhaseMaps
//
//
//


type MapPhaseImpl<W extends World, O extends PhaseMap, P extends PhaseMap> = {
	[K in keyof P]: P[K] extends any[]
		? PhaseImpl<P&O, W['context'], P[K]>
		: (P[K] extends PhaseMap
			 ? MapPhaseImpl<W, P&O, P[K]>
			 : never)
}

export type WorldImpl<W extends World> = {
	contextFac(x: RunContext): W['context']
	phases: MapPhaseImpl<W, {}, W['phases']>
}

export type PhaseImpl<P extends PhaseMap, X extends RunContext, D> = (x: X) => {
	guard(d: any): d is D
	run(d: D): Promise<_Phase<P>>
}

interface Impl<W extends World> extends WorldImpl<W> {}



// export type MachineImpl<W extends World, MK extends MachineKey<W> = MachineKey<W>> = {
// 	[K in PhaseKey<Machine<W, MK>>]: PhaseImpl<W, MK, Phase<W, Machine<W, MK>, K>>
// }

// export type _PhaseImpl<W extends World, MK extends MachineKey<W>, P extends Phase<W, Machine<W, MK>>> = (x: W['context']) => {
// 	guard(d: any): d is P['input']
// 	run(d: P['input']): Yield<Cmd<W, MK>>
// }


export type SpecWorld<W extends World> = W;

export function makeWorld<W extends World>(w: Impl<W>) {
	return w;
}


export type Cons<H, T extends readonly any[]> = ((h: H, ...t: T) => any) extends ((...l: infer L) => any) ? (L extends ReadonlyArray<any> ? L : never) : never;
export type Tail<T extends readonly Lit[]> = ((...args: T) => void) extends ((head: any, ...tail: infer U) => void) ? U : never;

export function tail<T extends readonly Lit[]>(t: T): Tail<T> {
	return <Tail<T>>t.slice(1)
}


export type Only<T, U extends T = T> = U & Impossible<Exclude<keyof U, keyof T>>;

export type Impossible<K extends keyof any> = {
  [P in K]: never;
};

export type Prop<O> = O[keyof O]

export type Productify<U> =
	(U extends any ? (u: U) => void : never) extends ((p: infer P) => void) ? P : never


export type Lit = string | number | boolean | undefined | null | void | {};


export function t<T extends readonly Lit[]>(...args: T) {
	return args
}


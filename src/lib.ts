import { Map } from 'immutable'
import { Attendee, Convener } from './Mediator'


export type Data = Map<string, any>
export type Id = string

export type Keyed<T> = { [key: string]: T }
export type Keys<O> = keyof O & string;

export type MachineSpec = Keyed<PhaseSpec>

export type PhaseSpec = {
	input: any
}

type PathVal<T, E> = { [K in keyof T]: [K, T[K] extends E ? T[K] : PathVal<T[K], E>] }[keyof T]

export type _Phase<P> = PathVal<P, any[]>

export type Phase<W extends World> = _Phase<W['phases']>

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


export type PhaseMapImpl<X, PCurr extends PhaseMap, PAcc extends false|PhaseMap = false> = {
	[K in keyof PCurr]:
		PCurr[K] extends any[]
			? PhaseImpl<PAcc extends false ? PCurr : (PCurr&PAcc), X, PCurr[K]>
			: (PCurr[K] extends PhaseMap
				? PhaseMapImpl<X, PAcc extends false ? PCurr : (PCurr&PAcc), PCurr[K]>
				: never)
}

export type WorldImpl<W extends World, PExplode extends boolean = false> = {
	contextFac(x: RunContext): W['context']
	phases: PhaseMapImpl<W['context'], W['phases'], PExplode extends true ? {} : false>
}

export type PhaseImpl<P extends PhaseMap, X, D> = (x: X) => {
	guard(d: any): d is D
	run(d: D): Promise<_Phase<P>>
}


export type SpecWorld<W extends World> = W;

export function makeWorld<W extends World>(w: WorldImpl<W, false>) {
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


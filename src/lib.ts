import { Map } from 'immutable'
import { Attendee, Convener } from './Mediator'
import { Observable } from 'rxjs/internal/Observable'


export type Data = Map<string, any>
export type Id = string

export type Keyed<T> = { [key: string]: T }
export type Keys<O> = keyof O & string;

export type MachineSpec = Keyed<PhaseSpec>

export type PhaseSpec = {
	input: any
}

type PathVal<T, E> = { [K in keyof T]: [K, T[K] extends E ? T[K] : PathVal<T[K], E>] }[keyof T]

export type Phase<P extends PhaseMap> = PathVal<P, any[]>

export interface MachineContext {
	readonly id: Id
	watch(ids: Id[]): Observable<Data>
	attach<R>(attend: Attendee<R>): Promise<false|[R]>
	convene<R>(ids: Id[], convener: Convener<R>): Promise<R>
}

export type PhaseMap = {
	[k: string]: PhaseMap | any[]
}

export type World = PhaseMap

export type PhaseMapImpl<X, PCurr extends PhaseMap, PAcc extends PhaseMap = {}> = {
	[K in keyof PCurr]:
		PCurr[K] extends any[]
			? PhaseImpl<PCurr&PAcc, X, PCurr[K]>
			: (PCurr[K] extends PhaseMap
				? PhaseMapImpl<X, PCurr[K], PCurr&PAcc>
				: never)
}

export type WorldImpl<P extends PhaseMap, X> = {
	// contextFac: (x: MachineContext) => (X & MachineContext)
	phases: PhaseMapImpl<(X & MachineContext), P>
}

export type ViewSegment = (name: string) => any;

export type PhaseImpl<P extends PhaseMap, X, D> = (x: X) => {
	guard(d: any): d is D
	run(d: D, all: any): Promise<Phase<P>|false>
}


export type ContextImpl<X> = {
	contextFac: (x: MachineContext) => X
}


export type SpecWorld<W extends World> = W;

// export const makeWorld = <P extends PhaseMap>() => <X>(w: WorldImpl<P, X>): WorldImpl<P, X> => w;
export const makeWorld = <P extends PhaseMap>() => <X>(c: ContextImpl<X>, w: WorldImpl<P, X>): WorldImpl<P, X> => ({ ...c, ...w });


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


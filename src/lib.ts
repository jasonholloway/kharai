import { Map } from 'immutable'
import { MAttendee, MConvener } from './Mediator'
import { Observable } from 'rxjs/internal/Observable'


export type DataMap = Map<string, any>
export type Id = string

export type Keyed<T> = { [key: string]: T }
export type Keys<O> = keyof O & string;

export type MachineSpec = Keyed<PhaseSpec>

export type PhaseSpec = {
	input: any
}

type PathVal<T, E> = { [K in keyof T]: [K, T[K] extends E ? T[K] : PathVal<T[K], E>] }[keyof T]

export type _Phase<P extends PhaseMap = PhaseMap> = PathVal<P, any[]>

export interface MachineContext<P> {
	readonly id: Id
	watch(ids: Id[]): Observable<[Id, P]>
	attach<R>(attend: MAttendee<R>): Promise<false|[R]>
	convene<R>(ids: Id[], convener: MConvener<R>): Promise<R>
}

export type PhaseMap = {
	[k: string]: PhaseMap | any[]
}

export type World = PhaseMap

export type PhaseMapImpl<X, MCurr extends PhaseMap, MAcc extends PhaseMap = {}> = {
	[K in keyof MCurr]:
		MCurr[K] extends any[]
			? PhaseImpl<_Phase<MCurr&MAcc>, X, MCurr[K]>
			: (MCurr[K] extends PhaseMap
				? PhaseMapImpl<X, MCurr[K], MCurr&MAcc>
				: never)
}

export type WorldImpl<M extends PhaseMap, X> = {
	// contextFac: (x: MachineContext) => (X & MachineContext)
	phases: PhaseMapImpl<X, M>
}

export type ViewSegment = (name: string) => any;


export type PhaseImpl<P, X, D> = (x: X) => {
	guard(d: any): d is D
	run(d: D, all: any): Promise<P|false>
}


export type ContextImpl<P, X extends MachineContext<P>> = {
	contextFac: (x: MachineContext<P>) => X
}


export type SpecWorld<W extends World> = W;

// export const makeWorld = <P extends PhaseMap>() => <X>(w: WorldImpl<P, X>): WorldImpl<P, X> => w;
export const makeWorld = <M extends PhaseMap, P = _Phase<M>>() => <X extends MachineContext<P>>(c: ContextImpl<P, X>, w: WorldImpl<M, X>): WorldImpl<M, X> & ContextImpl<P, X>  => ({ ...c, ...w });


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


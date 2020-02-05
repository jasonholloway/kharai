import { Map, Set } from 'immutable'
import { RO } from './util'


export type Data = Map<string, any>


export type MachineState<W extends World = World, M extends Machine<W> = Machine<W>> = {
	data: any
	resume: Command
}


export type Context<W extends World> = W['context']
export type Machine<W extends World, K extends MachineKey<W> = MachineKey<W>> = W['machines'][K]
export type Phase<W extends World, M extends Machine<W>, K extends PhaseKey<M> = PhaseKey<M>> = M['phases'][K]


export type Command<K extends string = string> = RO<[K, ...Lit[]]>
export type Yield<O> = Promise<RO<O[]>>

export type Keyed<T> = { [key: string]: T }
export type Keys<O> = keyof O & string;


export type MachineSpec = {
	phases: Keyed<PhaseSpec>
}

export type PhaseSpec = {
	input: any
}


export type World = {
	context: any
	machines: Keyed<MachineSpec>
	extraCommand: RO<[string, ...Lit[]]>
}

export type MachineKey<W extends World> = Keys<W['machines']>
export type PhaseKey<M extends MachineSpec> = Keys<M['phases']>


export type Id<W extends World = World, K extends MachineKey<W> = MachineKey<W>> = RO<[K, string]>;



export type WorldImpl<W extends World> = {
	machines: {
		[K in MachineKey<W>]: MachineImpl<W, Machine<W, K>>
	}
}

interface Impl<W extends World> extends WorldImpl<W> {}

export type MachineImpl<W extends World, M extends Machine<W> = Machine<W>> = {
	zero: MachineState<W, M>,
	phases: {
		[K in PhaseKey<M>]: PhaseImpl<W, M, Phase<W, M, K>>
	}
}

export type PhaseImpl<W extends World, M extends Machine<W>, P extends Phase<W, M>> = {
	guard(d: any): d is P['input'] 
	run(x: Context<W>, d: P['input']): Yield<['phase', PhaseKey<M>]>
}


export type SpecWorld<W extends World> = W;

export function makeWorld<W extends World>(w: Impl<W>) {
	return w;
}

export type Cons<H, T extends readonly Lit[]> = ((h: H, ...t: T) => any) extends ((...l: infer L) => any) ? (L extends ReadonlyArray<Lit> ? L : never) : never;
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


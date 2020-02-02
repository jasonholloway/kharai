import { Map, Set } from 'immutable'


export type Data = Map<string, any>


export type MachineState<W extends World = World, M extends Machine<W> = Machine<W>> = {
	data: any
	resume: Command
}


export type Context<W extends World> = W['context']
export type Machine<W extends World, K extends MachineKey<W> = MachineKey<W>> = W['machines'][K]
export type Phase<W extends World, M extends Machine<W>, K extends PhaseKey<M> = PhaseKey<M>> = M['phases'][K]


// have fallen back into trap of thinking we can specify commands all up front
// but we can't! because each machine-world has got its peculiar commands up its sleeve
// that are onlymaterialized when all is wired up
//
// that's the first point we can say 'now there is no type such that...'
// only when we put the handlers into the Coroutinizer will we know if all matches
// each handler has to have its own specific deduced type, has to self-determine via itsown factory
// otherwise types from outside will force it into a determinate shape
//
// self-determination fromeach handler; proven only when put in the crucible
// the machine has its headers
//
// and each MachineHost is just a kind of handler with its own headers



export type Command<K extends string = string> = readonly [K, ...readonly any[]]
export type Yield<O> = Promise<Set<O>>


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
	command: readonly [string, ...readonly any[]]
}

export type MachineKey<W extends World> = Keys<W['machines']>
export type PhaseKey<M extends MachineSpec> = Keys<M['phases']>


export type Id<W extends World = World, K extends MachineKey<W> = MachineKey<W>> = [K, string];



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

export type Cons<H, T extends any[]> = ((h: H, ...t: T) => any) extends ((...l: infer L) => any) ? L : never;
export type Tail<T extends readonly any[]> = ((...args: T) => void) extends ((head: any, ...tail: infer U) => void) ? U : never;

export function tail<T extends readonly any[]>(t: T): Tail<T> {
	return <Tail<T>>t.slice(1)
}


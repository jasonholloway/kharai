import { Map } from 'immutable'


export type Data = Map<string, any>


export type MachineState<W extends World = World, M extends Machine<W> = Machine<W>> = {
	data: any
	resume: ResumeCommand<W, M>
}

export type ResumeCommand<W extends World, M extends Machine<W>> =
	  false
	| PhaseKey<M>
	| [
			({ [K in ResumeKey<W>]: [K, Resume<W, K>] }[ResumeKey<W>]),
			PhaseKey<M>
		]


export type Context<W extends World> = W['context']
export type Resume<W extends World, K extends ResumeKey<W> = ResumeKey<W>> = W['resumes'][K]
export type Machine<W extends World, K extends MachineKey<W> = MachineKey<W>> = W['machines'][K]
export type Phase<W extends World, M extends Machine<W>, K extends PhaseKey<M> = PhaseKey<M>> = M['phases'][K]


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
	resumes: Keyed<any>
	machines: Keyed<MachineSpec>
}

export type ResumeKey<W extends World> = Keys<W['resumes']>
export type MachineKey<W extends World> = Keys<W['machines']>
export type PhaseKey<M extends MachineSpec> = Keys<M['phases']>


export type Id<W extends World = World, K extends MachineKey<W> = MachineKey<W>> = [K, string];



export type WorldImpl<W extends World> = {
	resumes: {
		[K in ResumeKey<W>]: ResumeImpl<W, Resume<W, K>>
	}
	machines: {
		[K in MachineKey<W>]: MachineImpl<W, Machine<W, K>>
	}
}

export type ResumeImpl<W extends World, R extends Resume<W> = Resume<W>> = {
	guard(r: R): r is R
	run(x: Context<W>, r: R): Promise<boolean>
}

export type MachineImpl<W extends World, M extends Machine<W> = Machine<W>> = {
	zero: MachineState<W, M>,
	phases: {
		[K in PhaseKey<M>]: PhaseImpl<W, M, Phase<W, M, K>>
	}
}

export type PhaseImpl<W extends World, M extends Machine<W>, P extends Phase<W, M>> = {
	guard(d: any): d is P['input'] 
	run(x: Context<W>, d: P['input']): Promise<ResumeCommand<W, M>>
}


export type SpecWorld<W extends World> = W;

export function makeWorld<W extends World>(w: WorldImpl<W>) {
	return w;
}

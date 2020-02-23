import { Map, Set, List } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, Cmd, SpecWorld, makeWorld, World, Machine, PhaseKey, WorldImpl, MachineState, MachineKey, Command, Yield, RunContext } from '../src/lib'
import { localize, compile, boot, Sink, Handler, join } from '../src/handler'
import { Subject, Observable } from 'rxjs'
import { gather } from './helpers'
import { tap, map } from 'rxjs/operators'
import { MeetSpace, Convener } from '../src/Mediator'


function buildMachine<W extends World, MK extends MachineKey<W>>(world: WorldImpl<W>, mk: MK) {
	const phaseImpls = world.machines[mk];
	const p2 = Map(phaseImpls).mapKeys(k => <PhaseKey<Machine<W, MK>>>k)

	const handler: Handler = [...p2.entries()].map(([pk, fac]) => {
		return [pk, async (data: any) => {
			const x = <W['context']><unknown>undefined
			const p = fac(x);
			if(!p.guard(data)) throw Error(`Bad data for phase ${mk}.${pk}: ${data}`);
			return await p.run(data);
		}] as const;
	})
	
	return localize(mk, handler);
}

describe('machines: running', () => {
	let loader: MachineLoader<World1>
	let space: MachineSpace<World1>
	let dispatch: Dispatch

	beforeEach(() => {
		loader = async () => Set();
		
		//dispatch is needed /before/ space... ****************
		space = new MachineSpace(world1, loader, dispatch)

		const contextFac = () => world1.contextFac({
			attach() { console.log('attaching'); throw 123 },
			convene() { throw 123 }
		});

		dispatch = compile(join(buildMachine(world1, 'dummy'), buildMachine(world1, 'root')));
	})	

	it('run through phases', async () => {
		const space = new MachineSpace(world1, loader, dispatch);
		space.log$.subscribe(console.log);

		const starter: Convener<void> = {
			convene([p]) { p.chat(['dummy', 'start']) }
		}

		await space.meet(starter)(['dummy123']);		

		// const [run] = space.summon(['dummy', '123']);

		const out = await gather(space.log$.pipe(tap(console.log)));

		// const out = await gather(run.log$.pipe(tap(console.log)));

		expect(out).toEqual([
			['dummy', 'start'],
			['dummy', 'middle'],
			['dummy', 'end']
		]);
	})

	it('resumes', async () => {
		const space = new MachineSpace(world1, loader, dispatch);

		// const [run] = space.summon(['fancy', '123']); //but - you don't want to send a command to an already-running machine...
		const starter: Convener<void> = {
			convene([p]) { p.chat(['fancy', 'start']) }
		}

		await space.meet(starter)(['fancy123']);		
		
		const out = await gather(space.log$.pipe(tap(console.log)));

		expect(out).toEqual(List([
			['fancy', 'start'],
			['delay', 10, 'fancy', 'end'],
			['delay', 10, 'fancy', 'end'],
			['fancy', 'end']
		]))
	})
	
	//TODO: meetings must update involved heads
	//

	interface World1 extends SpecWorld<{
		context: RunContext

		extraCommand: [
			'blah'
		]

		handlers: {
			'@delay': [number, ...any[]],
			'@wait': [...any[]]
		}
		
		machines: {
			root: {
				boot: { input: void }
			}

			dummy: {
				start: { input: number }
				middle: { input: any }
				end: { input: any }
			}

			fancy: {
				start: { input: any },
				end: { input: any }
			}
		}
	}> {}

	const world1 = makeWorld<World1>({

		contextFac(x) {
			return x;
		},

		machines: {

			root: {
				boot: x => ({
					guard(d): d is void { return true },
					run: async () => {
						const cmd = await x.attach<Cmd<World1, 'root'>>({
							chat(c) { return c; } //should be checking this here...
						});

						console.log('received cmd', cmd)

						if(cmd) {
							return cmd;
						}
						else {
							throw 'bad answer...';
						}
					}
				})
			},

			dummy: {
				start: x => ({
					guard(d): d is number { return true },
					run: async () => {
						return [['@me', 'middle']]
					}
				}),
				middle: x => ({
					guard(d): d is any { return true },
					run: async () => [['@me', 'end']]
				}),
				end: x => ({
					guard(d): d is any { return true },
					run: async () => [] 
				})
			},

			fancy: {
				start: x => ({
					guard(d): d is any { return true },
					run: async () => [['@delay', 10, '@me', 'end']]
				}),
				end: x => ({
					guard(d): d is any { return true },
					run: async () => []
				})
			}
		}
	})
})

describe('machines: loading and saving', () => {
	let atomSpace: AtomSpace<Data>
	let store: FakeStore
	let saver: AtomSaver<Data>

	beforeEach(() => {
		atomSpace = new AtomSpace();
		saver = new AtomSaver(new MonoidData(), atomSpace);
		store = new FakeStore(new MonoidData(), 3);
	})

	//...
})


type MachineLoader<W extends World> = (ids: Set<Id>) => Promise<Set<[Id, MachineState<W>]>>

type Dispatch<I extends Command = Command, O extends Command = Command> = (c: I) => Yield<O>

class MachineSpace<W extends World> {
	private readonly world: WorldImpl<W>
	private readonly atoms: AtomSpace<Data>
	private readonly loader: MachineLoader<W>
	private readonly mediator: MeetSpace
	private readonly dispatch: Dispatch
	private runs: Map<Id, Run<W>>

	private _log$: Subject<readonly [Id, Command]>
	log$: Observable<readonly [Id, Command]>

	constructor(world: WorldImpl<W>, loader: MachineLoader<W>, dispatch: Dispatch) {
		this.world = world;
		this.atoms = new AtomSpace();
		this.mediator = new MeetSpace();
		this.loader = loader;
		this.dispatch = dispatch;
		this.runs = Map();

		this._log$ = new Subject<readonly [Id, Command]>();
		this.log$ = this._log$;
	}


	meet<R = any>(convener: Convener<R>): (ids: Id[]) => Promise<R> {
		return async (ids) => {
			const runs = await this.load(ids);
			return await this.mediator.mediate(convener, Set(runs))
		}
	}
	
	private async load(ids: Id[]): Promise<IRun[]> {
		//AND WHAT ABOUT ASYNC LOADING HERE????????????? - it will cause race cond
		const summoned = Map(ids.map(id => {
			const found = this.runs.get(id);
			if(found) return [id, found];
			else {
				const def = this.world.machines['root'];
				const head = this.atoms.spawnHead();

				const run = new Run();
				run.log$
					.pipe(map(l => [id, l] as const))
				  .subscribe(this._log$)
				
				run.boot(this.dispatch, ['root', 'boot']);
				
				return [id, run];
			}
		}))
		this.runs = this.runs.merge(summoned); //lots of needless churn
		return [...summoned.values()];
	}

	//below shouldn't be public; all should be via meet()
// 	summon<IR extends readonly Id[]>(...ids: IR): IRun<W, IR[number][0]>[] {
// 		const summoned = Map(ids.map(id => {
// 			const found = this.runs.get(id);
// 			if(found) return [id, found];
// 			else {
// 				const def = this.world.machines[id[0]];
// 				const head = this.atoms.spawnHead();

// 				const run = new Run();
// 				this._log$.next([id, run.log$]);
// 				run.boot(this.dispatch, [id[0], ...def.zero.resume]);
				
// 				return [id, run];
// 			}
// 		}))
// 		this.runs = this.runs.merge(summoned); //lots of needless churn
// 		return [...summoned.values()];
// 	}
}

class Run<W extends World, K extends MachineKey<W> = MachineKey<W>, M extends Machine<W, K> = Machine<W, K>> implements IRun {
	private _log$: Subject<Command>
	log$: Observable<Command>
	
	constructor() {
		this._log$ = new Subject<Command>();
		this.log$ = this._log$;
	}

	boot(dispatch: Dispatch, command: Command) {
		const sink = new Sink(this._log$);
		setImmediate(() => boot(dispatch, sink, command))
	}
}

interface IRun {
	readonly log$: Observable<Command>
}


//---------------------------------

class MonoidData implements _Monoid<Data> {
  zero: Data = Map()
	add(a: Data, b: Data): Data {
		return a.merge(b);
  }
}

class FakeStore extends Store<Data> {
	saved: Data[] = []
	private _maxBatch: number;

	constructor(monoid: _Monoid<Data>, batchSize: number) {
		super(monoid);
		this._maxBatch = batchSize;
	}

	prepare(v: Data): {save():Promise<void>}|false {
		return v.count() <= this._maxBatch
			&& {
				save: () => {
					this.saved.push(v);
					return Promise.resolve();
				}
			};
	}
}

import { List, Map, Set } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, SpecWorld, makeWorld, World, WorldImpl, RunContext, Phase, PhaseMap, _Phase } from '../src/lib'
import { Subject, Observable } from 'rxjs'
import { gather } from './helpers'
import { map } from 'rxjs/operators'
import { Mediator, Convener, Attendee } from '../src/Mediator'
import { Dispatch, buildDispatch } from '../src/dispatch'
import { delay } from '../src/util'
import { AtomRef } from '../src/atoms'
import { inspect } from 'util'

describe('machines: running', () => {
	let loader: MachineLoader<Phase<World1>>
	let atoms: AtomSpace<Data>;
	let space: MachineSpace<World1>
	let dispatch: Dispatch<World1['context'], Phase<World1>>
	
	beforeEach(() => {
		atoms = new AtomSpace<Data>();
		loader = async ([id]) => Map({ [id]: [atoms.spawnHead()] }); //FILL OUT!!!!!!!!
		dispatch = buildDispatch(world1.phases);

		space = new MachineSpace(world1, loader, dispatch, ['$boot', []])
		
		// space.log$.subscribe(console.log);
	})	

	it('run through phases', async () => {
		const [logs] = await Promise.all([
			gather(space.log$),
			space.boot('bob', ['rat', ['wake', []]])
		]);

		expect(logs.filter(([,[t]]) => t != Save)).toEqual([
			['bob', ['$boot', []]],
			['bob', ['rat', ['wake', []]]],
			['bob', ['rat', ['squeak', [123]]]],
			['bob', ['$end', ['I have squeaked 123!']]]
		]);
	})

	it('two run at once', async () => {
		const [logs] = await Promise.all([
			gather(space.log$),
			space.boot('nib', ['hamster', ['wake', [77]]]),
		  space.boot('bob', ['rat', ['wake', []]])
		]);

		expect(logs.filter(([,[t]]) => t != Save)).toEqual([
			['nib', ['$boot', []]],
			['bob', ['$boot', []]],
			['nib', ['hamster', ['wake', [77]]]],
			['bob', ['rat', ['wake', []]]],
			['nib', ['$end', [77]]],
			['bob', ['rat', ['squeak', [123]]]],
			['bob', ['$end', ['I have squeaked 123!']]]
		])
	})

	it('two talk to one another', async () => {
		const [logs] = await Promise.all([
			gather(space.log$),
			space.boot('gaz', ['guineaPig', ['runAbout', []]]),
			space.boot('goz', ['guineaPig', ['gruntAt', ['gaz']]])
		]);

		expect(logs.filter(([,[t]]) => t != Save)).toEqual([
			['gaz', ['$boot', []]],
			['goz', ['$boot', []]],
			['gaz', ['guineaPig', ['runAbout', []]]],
			['goz', ['guineaPig', ['gruntAt', ['gaz']]]],
			['goz', ['$end', ['squeak!']]],
			['gaz', ['$end', ['grunt!']]]
		])
	})


  describe('saving', () => {
		let logs: Emit<Phase<World1>>[]

		beforeEach(async () => {
			[logs] = await Promise.all([
				gather(space.log$),
				space.boot('gaz', ['guineaPig', ['runAbout', []]]),
				space.boot('goz', ['guineaPig', ['gruntAt', ['gaz']]])
			]);
		})
		
		it('emits some saves', () => {
			expect(logs.some(([,[k]]) => k == Save)).toBeTruthy();
		})

		it('final atoms represent state', () => {

			const atomRefs = List(logs)
				.filter(([id, [k]]) => id == 'gaz' && k == Save)
			  .map(([,[, atom]]) => <AtomRef<Data>>atom);

			console.log(inspect(atomRefs.toArray(), { depth: 5 }))

			const lastAtom = atomRefs.last(undefined)?.resolve();

			if(!lastAtom) throw 'no atom found!';
			else {
				expect(lastAtom.val).toEqual(Map({ gaz: ['$end', ['grunt!']] }))
			}
		})
	})

	
	
	type Template<Me extends World = World> = SpecWorld<{
		context: RunContext
		phases: {
			$boot: []
			$end: [any]
			$wait: [number, Phase<Me>]
			$watch: [Id, string, Phase<Me>]
			
			rat: {
				wake: [],
				squeak: [number]
			}

			hamster: {
				wake: [number]
			}

			guineaPig: {
				runAbout: []
				gruntAt: [Id]
			}
		}
	}>

	type World1 = Template<Template>

	const world1 = makeWorld<World1>({
		contextFac: x => x,
		phases: {

			$boot: x => ({
				guard(d): d is [] { return true },
				async run() {
					while(true) {
						const answer = await x.attach<Phase<World1>>({
							chat(c) { return c; } //should be checking this here...
						});

						if(answer) {
							return answer[0];
						}
						else {
							await delay(30); //when we release properly, this can be removed
						}
					}
				}
			}),

			$end: x => ({
				guard(d): d is [any] { return true },
				async run() { return false }
			}),

			$wait: x => ({
				guard(d): d is [number, Phase<World1>] { return true },
				async run() {
					return ['$boot', []]
				}
			}),

			$watch: x => ({
				guard(d): d is [Id, string, Phase<World1>] { return true },
				async run() {
					return ['$boot', []]
				}
			}),

			rat: {
				wake: x => ({
					guard(d): d is [] { return true },
					async run() {
						return ['squeak', [123]]
					}
				}),

				squeak: x => ({
					guard(d): d is [number] { return true },
					async run([d]) {
						return ['$end', [`I have squeaked ${d}!`]]
					}
				})
			},

			hamster: {
				wake: x => ({
					guard(d): d is [number] { return true },
					async run([d]) {
						return ['$end', [d]]
					}
				}),
			},

			guineaPig: {
				runAbout: x => ({
					guard(d): d is [] { return true },
					async run() {
						const a = await x.attach({ chat(m) { return [m, 'squeak!'] } });
						return (a && ['$end', a]) || ['$end', ['BIG NASTY ERROR']]
					}
				}),

				gruntAt: x => ({
					guard(d): d is [Id] { return true },
					async run([id]) {
						const resp = await x.convene([id], {
							convene([p]) {
								const a = p.chat('grunt!');
								if(a) return a;
								else throw Error('bad response from attendee')
							}
						});
						
						return ['$end', resp]
					}
				})
			}
		},
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


type MachineLoader<P> = (ids: Set<Id>) => Promise<Map<Id, [Head<Data>, P?]>>


const Save = Symbol('Save');

type Emit<P = any> = readonly [Id, MachineEmit<P>]
type MachineEmit<P = any> = P | [typeof Save, AtomRef<Data>, true?]

class MachineSpace<W extends World, PM extends PhaseMap = W['phases'], P = _Phase<PM>, X = W['context']> {
	private readonly world: WorldImpl<W>
	private readonly loader: MachineLoader<P>
	private readonly mediator: Mediator
	private readonly dispatch: Dispatch<X, P>
	private readonly zeroPhase: P
	private runs: Map<Id, Promise<Run<X, P>>>

	private _log$: Subject<Emit<P>>
	log$: Observable<Emit<P>>

	constructor(world: WorldImpl<W>, loader: MachineLoader<P>, dispatch: Dispatch<X, P>, zeroPhase: P) {
		this.world = world;
		this.loader = loader;
		this.dispatch = dispatch;
		this.zeroPhase = zeroPhase;
		this.mediator = new Mediator();
		this.runs = Map();

		this._log$ = new Subject<Emit<P>>();
		this.log$ = this._log$;
	}

	private createContext(run: Run<X, P>): X {
		return this.world.contextFac({
			attach: <R>(attend: Attendee<R>) => {
				return this.mediator.attach(run, attend)
			},
			convene: async <R>(ids: Id[], convene: Convener<R>) => {
				const runs = await this.summon(Set(ids));
				return this.mediator.convene(convene, Set(runs.values()));
			}
		});
	}


	meet<R = any>(convener: Convener<R>): (ids: Id[]) => Promise<R> {
		return async (ids) => {
			const runs = await this.summon(Set(ids));
			return await this.mediator
				.convene(convener, Set(runs.values()))
		}
	}

	tell(id: Id, m: any) {
		return this.meet({ convene([p]) { return p.chat([m]) } })([id]);
	}

	boot(id: Id, p: Phase<W>) {
		return this.tell(id, p);
	}
	

	private async summon(ids: Set<Id>): Promise<Map<Id, IRun<P>>> {

		const summoned = ids.map(id => {
			const found = this.runs.get(id);
			if(found) {
				return [false, id, found] as const;
			}
			else {
				const loading = this.loader(Set([id]));

				return [
					true,
					id,
					loading.then(([[,[head, phase]]]) => {
						const run: Run<X, P> = new Run<X, P>(this.dispatch, () => this.createContext(run));

						run.log$
							.pipe(map(l => [id, l] as const))
							.subscribe(this._log$)

						run.begin(id, head, phase || this.zeroPhase);

						return run;
					})
				] as const;
			}
		})

		const toAdd = summoned
			.filter(([isNew]) => isNew)
			.map(([, id, loading]) => <[Id, Promise<Run<X, P>>]>[id, loading]);
    
		this.runs = this.runs.merge(Map(toAdd));

		const loadedAll =
			await Promise.all(
				summoned.map(([, id, loading]) =>
										 loading.then(r => <[Id, Run<X, P>]>[id, r])));

		return Map(loadedAll);
	}
}

export class Run<X, P> implements IRun<P> {

	private _log$: Subject<MachineEmit<P>>
	private dispatch: Dispatch<X, P>
	private contextFac: () => X
	
	log$: Observable<MachineEmit<P>>
	
	constructor(dispatch: Dispatch<X, P>, contextFac: () => X) {
		this._log$ = new Subject<MachineEmit<P>>();
		this.log$ = this._log$;

		this.dispatch = dispatch;
		this.contextFac = contextFac;
	}

	begin(id: Id, head: Head<Data>, phase: P) {
		const log$ = this._log$;
		const disp = this.dispatch;
		const contextFac = this.contextFac;

		setImmediate(() => (async () => {			
				while(true) {
					log$.next(phase);

					const out = await disp(contextFac())(phase);

					if(out) {
						head.commit(Map({ [id]: out }))
						log$.next([Save, head.ref()]);
						phase = out;
					}
					else {
						break;
					}
				}
			})()
			.catch(log$.error.bind(log$))
			.finally(log$.complete.bind(log$)));
	}
}

interface IRun<P> {
	readonly log$: Observable<MachineEmit<P>>
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

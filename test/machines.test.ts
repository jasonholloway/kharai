import { Map, Set } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, SpecWorld, makeWorld, World, WorldImpl, RunContext, Phase, PhaseMap, _Phase } from '../src/lib'
import { Subject, Observable } from 'rxjs'
import { gather } from './helpers'
import { map } from 'rxjs/operators'
import { Mediator, Convener, Attendee } from '../src/Mediator'
import { Dispatch, buildDispatch } from '../src/dispatch'
import { delay } from '../src/util'
import { AtomRef } from '../src/atoms'

describe('machines: running', () => {
	let loader: MachineLoader<World1>
	let space: MachineSpace<World1>
	let dispatch: Dispatch<World1['context'], Phase<World1>>

	beforeEach(() => {
		loader = async () => Set();
		dispatch = buildDispatch(world1.phases);

		space = new MachineSpace(world1, loader, dispatch, ['$boot', []])
		space.log$.subscribe(console.log);
	})	

	it('run through phases', async () => {
		const gathering = gather(space.log$);

		await space.boot('bob', ['rat', ['wake', []]]);

		expect(await gathering).toEqual([
			['bob', ['$boot', []]],
			['bob', ['rat', ['wake', []]]],
			['bob', ['rat', ['squeak', [123]]]],
			['bob', ['$end', ['I have squeaked 123!']]]
		]);
	})

	it('two run at once', async () => {
		const gathering = gather(space.log$);

		await Promise.all([
			space.boot('nib', ['hamster', ['wake', [77]]]),
		  space.boot('bob', ['rat', ['wake', []]])
		]);

		expect(await gathering).toEqual([
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
		const gathering = gather(space.log$);

		await Promise.all([
			space.boot('gaz', ['guineaPig', ['runAbout', []]]),
			space.boot('goz', ['guineaPig', ['gruntAt', ['gaz']]])
		]);

		expect(await gathering).toEqual([
			['gaz', ['$boot', []]],
			['goz', ['$boot', []]],
			['gaz', ['guineaPig', ['runAbout', []]]],
			['goz', ['guineaPig', ['gruntAt', ['gaz']]]],
			['goz', ['$end', ['squeak!']]],
			['gaz', ['$end', ['grunt!']]]
		])
	})

	it('heads are combined on meeting', async () => {
		const gathering = gather(space.log$);

		await Promise.all([
			space.boot('gaz', ['guineaPig', ['runAbout', []]]),
			space.boot('goz', ['guineaPig', ['gruntAt', ['gaz']]])
		]);

		await gathering;

		throw 'no they\'re not!'

		//now, somehow test the head recombining!
		//means I need to get the heads from the space
		//or get them as outputs somehow

		//we need to get the heads in particular
		//calling save on the entire space would be one way of doing it 
		//an ordered list of atoms to save would be returned

		//it wouldn't be 'save' so much as 'getAtoms' or somesuch
		//though we want the phases to be able t say 'save' quite explicitly
		//which implicates the MachineSpace in actually calling the save

		//almost like a MachineSpace is different from the Runner
		//the runner would do the actual saving; the MachineSpace would yield,
		//what? actual wrapped machines; these are the real runtimes

		//these little runtimes need to be able to trigger a save,
		//and such a save would take a prioritised list of heads from the MachineSpace
		//and pass them to the AtomSaver; MachineSpace should certainly know nothing
		//of AtomSaver; but MachineRuntime? it needs to know about it

		//what would MachineSpace actually do in this case?
		//it would know what machines were about, 
		//it would load them as needed, and it would wrap each one
		//in a nice yolk - but this yolk wouldn't be its own; it would be
		//provided from outside
		//
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


type MachineLoader<P> = (ids: Set<Id>) => Promise<Set<[Id, P]>>


const Save = Symbol('Save');

type Emit<P> = readonly [Id, P] | readonly [typeof Save, Id, AtomRef<Data>, true?]

class MachineSpace<W extends World, PM extends PhaseMap = W['phases'], P = _Phase<PM>, X = W['context']> {
	private readonly world: WorldImpl<W>
	private readonly atoms: AtomSpace<Data>
	private readonly loader: MachineLoader<W>
	private readonly mediator: Mediator
	private readonly dispatch: Dispatch<X, P>
	private readonly zeroPhase: P
	private runs: Map<Id, Promise<Run<X, P>>>

	private _log$: Subject<Emit<P>>
	log$: Observable<Emit<P>>

	constructor(world: WorldImpl<W>, loader: MachineLoader<W>, dispatch: Dispatch<X, P>, zeroPhase: P) {
		this.world = world;
		this.atoms = new AtomSpace();
		this.mediator = new Mediator();
		this.loader = loader;
		this.dispatch = dispatch;
		this.zeroPhase = zeroPhase;
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
		 		const run = new Run<X, P>();

		 		run.log$
		 			.pipe(map(l => [id, l] as const))
		 		  .subscribe(this._log$)
			
		 		run.begin(this.dispatch, this.createContext.bind(this, run), this.zeroPhase);
			
		 		return [true, id, Promise.resolve(run)] as const;
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

	private _log$: Subject<P>
	log$: Observable<P>
	
	constructor() {
		this._log$ = new Subject<P>();
		this.log$ = this._log$;
	}

	begin(dispatch: Dispatch<X, P>, contextFac: () => X, phase: P) {
		const log$ = this._log$;

		setImmediate(() => (async () => {			
				while(true) {
					log$.next(phase);

					const out = await dispatch(contextFac())(phase);

					if(out) phase = out;
					else break;
				}
			})()
			.catch(log$.error.bind(log$))
			.finally(log$.complete.bind(log$)));
	}
}

interface IRun<P> {
	readonly log$: Observable<P>
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

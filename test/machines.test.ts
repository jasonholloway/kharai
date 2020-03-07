import { List, Map, Set } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace, { Head } from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, SpecWorld, makeWorld, World, WorldImpl, MachineContext, Phase, PhaseMap, _Phase } from '../src/lib'
import { Subject, Observable, from, merge, Operator, OperatorFunction } from 'rxjs'
import { tap, flatMap, mergeAll, publish, toArray, endWith, startWith, skipWhile, reduce, scan, takeUntil, takeWhile, finalize, skip } from 'rxjs/operators'
import { Mediator, Convener, Attendee } from '../src/Mediator'
import { Dispatch, buildDispatch } from '../src/dispatch'
import { delay } from '../src/util'
import { AtomRef, Atom } from '../src/atoms'
import { inspect, isString } from 'util'
import Commit from '../src/Commit'
import { gather } from './helpers'

describe('machines: running', () => {
  let loader: MachineLoader<Phase<World1>>
  let atoms: AtomSpace<Data>;
  let space: MachineSpace<World1>
  let dispatch: Dispatch<World1['context'], Phase<World1>>
  let run: Run<World1>
  
  beforeEach(() => {
    atoms = new AtomSpace<Data>();
    loader = async ([id]) => Map({ [id]: [atoms.spawnHead()] }); //FILL OUT!!!!!!!!
    dispatch = buildDispatch(world1.phases);
    space = new MachineSpace(world1, loader, dispatch, ['$boot', []])
    run = space.newRun();
  })  

  it('run through phases', async () => {
    const [logs] = await Promise.all([
      gather(run.log$.pipe(phasesOnly())),
      run.boot('bob', ['rat', ['wake', []]])
    ]);

    expect(logs).toEqual([
      ['bob', ['$boot', []]],
      ['bob', ['rat', ['wake', []]]],
      ['bob', ['rat', ['squeak', [123]]]],
      ['bob', ['$end', ['I have squeaked 123!']]]
    ]);
  })

  it('two run at once', async () => {
    const [logs] = await Promise.all([
      gather(run.log$.pipe(phasesOnly())),
      run.boot('nib', ['hamster', ['wake', [77]]]),
      run.boot('bob', ['rat', ['wake', []]])
    ]);

    expect(logs).toEqual([
      ['nib', ['$boot', []]],
      ['bob', ['$boot', []]],
      ['nib', ['hamster', ['wake', [77]]]],
      ['bob', ['rat', ['wake', []]]],
      ['bob', ['rat', ['squeak', [123]]]],
      ['bob', ['$end', ['I have squeaked 123!']]],
      ['nib', ['$end', [77]]],
    ])
  })

  it('two talk to one another', async () => {
    const [logs] = await Promise.all([
      gather(run.log$.pipe(phasesOnly())),
      run.boot('gaz', ['guineaPig', ['runAbout', []]]),
      run.boot('goz', ['guineaPig', ['gruntAt', ['gaz']]])
    ]);

    expect(logs).toEqual([
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
    let atoms: { [id:string]: Atom<Data>[] }

    beforeEach(async () => {
      [logs] = await Promise.all([
        gather(run.log$.pipe(tap(console.log))),
        run.boot('gaz', ['guineaPig', ['runAbout', []]]),
        run.boot('goz', ['guineaPig', ['gruntAt', ['gaz']]])
      ]);

      atoms = List(logs)
        .filter(([t]) => t == Save)
			  .map(([, id, a]) => [<Id>id, <AtomRef<Data>>a] as const)
        .reduce((
					ac: { [id:string]:Atom<Data>[] },
					[id,ar]) => {
            const a = ar.resolve()
            if(a) {
              if(ac[id]) ac[id].push(a);
              else ac[id] = [a];
              return ac;
            }
            else throw 'bad!';
          }, {});

      console.log(inspect(atoms, { depth: 10 }));
    })
    
    it('emits some saves', () => {
      expect(logs.some(([k]) => k == Save))
        .toBeTruthy();
    })

    it('final atoms represent state', () => {
      expect(atoms['gaz'][1].val)
        .toEqual(Map({ gaz: ['$end', ['grunt!']] }))

      expect(atoms['goz'][1].val)
        .toEqual(Map({ goz: ['$end', ['squeak!']] }))
    })

    it('atoms start separate', () => {
      expect(atoms['gaz'][0])
        .not.toBe(atoms['goz'][0]);
    })

    it('atoms conjoin on meet', () => {
      expect(atoms['gaz'][1])
        .toBe(atoms['goz'][1]);
    })
  })
  
  
  type Template<Me extends World = World> = SpecWorld<{
    context: MachineContext
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
            await delay(100);
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

type Emit<P = any> =
		readonly [Id, P]
	| readonly [typeof Save, Id, AtomRef<Data>, true?]

class Run<W extends World, P = Phase<W>> {
  private readonly space: MachineSpace<W, PhaseMap, P>
  private readonly mediator: Mediator
  private readonly log$$: Subject<Observable<Emit<P>>>

  log$: Observable<Emit<P>>

  constructor(space: MachineSpace<W, PhaseMap, P, any>, mediator: Mediator) {
    this.space = space;
    this.mediator = mediator;
    this.log$$ = new Subject();
    this.log$ = this.log$$.pipe(mergeAll());

		const count$ = this.log$$.pipe(
			flatMap(l => l.pipe(
				skipWhile<any>(_ => true),
				startWith<number>(1),
			  endWith<number>(-1),
				)),
			scan((c, n) => c + n, 0));

		count$.pipe(
			takeWhile(c => c > 0),
			finalize(() => this.log$$.complete())
		).subscribe();
  }
  
  async meet<R = any>(ids: Id[], convener: Convener<R>): Promise<R> {
    const machine$ = publish<IMachine<P>>()(this.space.summon(Set(ids)));

    this.log$$.next(machine$.pipe(flatMap(m => m.log$)))
    const gathering = machine$.pipe(toArray()).toPromise();
    machine$.connect();

    return await this.mediator
      .convene(convener, Set(await gathering));
  }

  tell(id: Id, m: any) {
    return this.meet([id], { convene([p]) { return p.chat([m]) } });
  }

  boot(id: Id, p: Phase<W>) {
    return this.tell(id, p);
  }
}


class MachineSpace<W extends World = World, PM extends PhaseMap = W['phases'], P = _Phase<PM>, X = W['context']> {
  private readonly world: WorldImpl<W>
  private readonly loader: MachineLoader<P>
  private readonly mediator: Mediator
  private readonly dispatch: Dispatch<X, P>
  private readonly zeroPhase: P
  private machines: Map<Id, Promise<Machine<X, P>>>

  private log$$: Subject<Observable<Emit<P>>>
  log$: Observable<Emit<P>>

  constructor(world: WorldImpl<W>, loader: MachineLoader<P>, dispatch: Dispatch<X, P>, zeroPhase: P) {
    this.world = world;
    this.loader = loader;
    this.dispatch = dispatch;
    this.zeroPhase = zeroPhase;
    this.mediator = new Mediator();
    this.machines = Map();

    this.log$$ = new Subject();
    this.log$ = this.log$$.pipe(mergeAll())

  }

  newRun(): Run<W, P> {
    //summoning must return a context
    //
    //
    
    return new Run(this, this.mediator);
  }

  //summon, instead of returning its map
  //should just return a stream

  summon(ids: Set<Id>): Observable<IMachine<P>> {
    const summoned = ids.map(id => {
      const found = this.machines.get(id);
      if(found) {
        return [false, id, found] as const;
      }
      else {
        const loading = this.loader(Set([id]));

        return [
          true,
          id,
          loading.then(([[,[head, phase]]]) => {
            const machine: Machine<X, P> = new Machine<X, P>(this.dispatch, () => this.buildContext(machine), this.world.contextFac);

            this.log$$.next(machine.log$);

            machine.begin(id, head, phase || this.zeroPhase);

            return machine;
          })
        ] as const;
      }
    })

    const toAdd = summoned
      .filter(([isNew]) => isNew)
      .map(([, id, loading]) => <[Id, Promise<Machine<X, P>>]>[id, loading]);
    
    this.machines = this.machines.merge(Map(toAdd));

    return merge(...(summoned.map(
      ([,, loading]) => from(loading))
    ));
  }

  // async meet<R = any>(ids: Id[], convener: Convener<R>): Promise<R> {
  //  const machine$ = publish<IMachine<P>>()(this.space.summon(Set(ids)));

  //  this.log$$.next(machine$.pipe(flatMap(m => m.log$)))
  //  const gathering = machine$.pipe(toArray()).toPromise();
  //  machine$.connect();

  //  return await this.mediator
  //    .convene(convener, Set(await gathering));
  // }

  //even a convene like below must extend each involved Run
  //if the machines of two separate Runs interact, then they too must wait on each other to complete (tho possibly not actually)
  //but if a machine of a Run summons another machine, then the context of that run should then include the child.
  //
  //this is it: every machine has its one or more runs it reports to
  //as soon as another is contacted, that other is also implicated in each originary run
  //
  //another point: summoning the same machine repeatedly (as will certainly happen)
  //will register new sinks each time, duplicating all emissions
  //
  //almost like each Run should unify streams so that only one stream for each address is recognised
  //so the space holds the 'physical' machines, while Runs hold views of the same, but the pattern is similar in both'

  private buildContext(m: Machine<X, P>): MachineContext {
    const _this = this;
    return {
      async attach<R>(attend: Attendee<R>): Promise<false|[R]> {
        return _this.mediator.attach(m, attend);
      },

      async convene<R>(ids: Id[], convene: Convener<R>): Promise<R> {
        //has to be loaded into the Run!!!
        //not separate

        
        const machine$ = _this.summon(Set(ids));
        return await _this.mediator
          .convene(convene, Set(await gather(machine$)));
      }
    }
  }
}


export class Machine<X, P> implements IMachine<P> {
  private _log$: Subject<Emit<P>>
  private dispatch: Dispatch<X, P>
  private getRootContext: () => MachineContext
  private finishContext: (x: MachineContext) => X

  log$: Observable<Emit<P>>
  
  constructor(dispatch: Dispatch<X, P>, getRootContext: () => MachineContext, finishContext: (x: MachineContext) => X) {
    this._log$ = new Subject<Emit<P>>();
    this.log$ = this._log$;

    this.dispatch = dispatch;
    this.getRootContext = getRootContext;
    this.finishContext = finishContext;
  }

  begin(id: Id, head: Head<Data>, phase: P) {
    const log$ = this._log$;
    const disp = this.dispatch.bind(this);
    const buildContext = this.buildContext.bind(this);
    const getRootContext = this.getRootContext.bind(this);

    setImmediate(() => (async () => {     
        while(true) {
          log$.next([id, phase]);

          const commit = new Commit<Data>(new MonoidData(), head);

          const context = buildContext(getRootContext(), head);
          const out = await disp(context)(phase);

          if(out) {
            await commit.complete(Map({ [id]: out }));
            log$.next([Save, id, head.ref()]);
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
  
  private buildContext(x: MachineContext, h: Head<Data>): X {
    return this.finishContext({
      attach<R>(attend: Attendee<R>) {
        return x.attach(attend);
        // return x.attach({
        //  chat(m, p) {
        //    const [ret, ans] = attend.chat(m, p);
        //    if(ans) {
        //      return [ret, [true, ans]];
        //    }
        //    else {
        //      return [ret, [false, h]];
        //    }
        //  }
        // });
      },
      convene<R>(ids: Id[], convene: Convener<R>) {
        return x.convene(ids, convene);
      }
    });
  }
}

//IRun is to be merged together, so as we interact with the system, we build up a big composite handle

interface IMachine<P> {
  readonly log$: Observable<Emit<P>>
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

function phasesOnly(): OperatorFunction<Emit<any>, readonly [Id, any]> {
	return flatMap(l => {
		if(isString(l[0])) {
			return [<[Id, any]>l];
		}
		else {
			return [];
		}
	})
}

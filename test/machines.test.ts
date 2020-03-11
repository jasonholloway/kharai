import { List, Map } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, SpecWorld, makeWorld, World, MachineContext, Phase, PhaseMapImpl, PhaseMap, WorldImpl, PhaseImpl } from '../src/lib'
import { OperatorFunction } from 'rxjs'
import { flatMap } from 'rxjs/operators'
import { Dispatch, buildDispatch } from '../src/dispatch'
import { delay } from '../src/util'
import { AtomRef, Atom } from '../src/atoms'
import { isString } from 'util'
import { Commit, $Commit } from '../src/Committer'
import { gather } from './helpers'
import { Emit, MachineLoader, MachineSpace, Run } from '../src/MachineSpace'
import MonoidData from '../src/MonoidData'

describe('machines: running', () => {
  let loader: MachineLoader<Phase<RodentWorld>>
  let atoms: AtomSpace<Data>;
  let space: MachineSpace<RodentWorld>
  let dispatch: Dispatch<MachineContext, Phase<RodentWorld>>
  let run: Run<RodentWorld, MachineContext, Phase<RodentWorld>>
  
  beforeEach(() => {
    atoms = new AtomSpace<Data>();
    loader = async ([id]) => Map({ [id]: [atoms.spawnHead()] }); //FILL OUT!!!!!!!!
    dispatch = buildDispatch(rodentWorld.phases);
    space = new MachineSpace(rodentWorld, loader, dispatch, ['$boot', []])
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

	it('one can watch the other', async () => {
		// const [logs] = await Promise.all([
		// 	gather(run.log$.pipe(phasesOnly())),
		// 	run.boot('maz', ['mink', ['eatFrog', []]]),
		// 	run.boot('moz', ['mink', ['watch', ['maz']]])
		// ]);

		throw 123;
	})
	

  describe('saving', () => {
    let logs: Commit<Data>[]
    let atoms: Atom<Data>[]

    beforeEach(async () => {
			const gatheringLogs = gather(space.log$.pipe(commitsOnly()));
			
      await Promise.all([
        run.log$.toPromise(),
        run.boot('gaz', ['guineaPig', ['runAbout', []]]),
        run.boot('goz', ['guineaPig', ['gruntAt', ['gaz']]])
      ]);

			space.complete();
			logs = await gatheringLogs;
			
      atoms = List(logs)
			  .flatMap(([,ar]) => {
					const a = ar.resolve();
					return a ? [a] : [];
				})
				.toArray();

      // console.log(inspect(atoms, { depth: 10 }));
    })
    
    it('emits some saves', () => {
      expect(logs.length).toBeGreaterThan(0);
		})

    it('atoms start separate', () => {
      expect(atoms[0])
        .not.toBe(atoms[1]);
    })

    it('atoms conjoin on meet', () => {
      expect(atoms[2].val)
			  .toEqual(Map({
					gaz: ['$end', ['grunt!']],
					goz: ['$end', ['squeak!']]
				}));
    })
  })
	
	type TRodentWorld<Me extends World = World> = SpecWorld<{
    $boot: []
    $end: [any]
    $wait: [number, Phase<Me>]

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
  }>

	type TFishWorld<Me extends World = World> = SpecWorld<{
    $boot: []
    $end: [any]
    $wait: [number, Phase<Me>]

    trout: [number]
	}>

  type RodentWorld = TRodentWorld<TRodentWorld>


  const bootPhase = <W extends World>(): PhaseImpl<W, MachineContext, []> =>
    (x => ({
      guard(d: any): d is [] { return true },
      async run() {
        while(true) {
          const answer = await x.attach<Phase<W>>({
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
    }));

  const endPhase = <W extends World>(): PhaseImpl<W, MachineContext, [any]> =>
    (x => ({
      guard(d: any): d is [any] { return true },
      async run() { return false as const; }
    }));

  const waitPhase = <W extends World>(): PhaseImpl<W, MachineContext, [number, Phase<W>]> =>
    (x => ({
      guard(d: any): d is [number, Phase<W>] { return true },
      async run([delay, next]) {
        return next;
      }
    }));
  

  // function basicPhases<Me extends World>(): PhaseMapImpl<MachineContext, TBasicWorld<Me>> {
  //   return {
  //     $boot: (x => ({
  //       guard(d): d is [] { return true },
  //       async run() {
  //         while(true) {
  //           const answer = await x.attach<Phase<TBasicWorld<Me>>>({
  //             chat(c) { return c; } //should be checking this here...
  //           });

  //           if(answer) {
  //             return answer[0];
  //           }
  //           else {
  //             await delay(30); //when we release properly, this can be removed
  //           }
  //         }
  //       }
  //     })),

  //     $end: x => ({
  //       guard(d): d is [any] { return true },
  //       async run() { return false }
  //     }),

  //     $wait: x => ({
  //     	guard(d): d is [number, Phase<Me>] { return true },
  //     	async run() {
  //     		return ['$boot', []]
  //     	}
  //     }),

  //     // $watch: x => ({
  //     // 	guard(d): d is [] { return true },
  //     // 	async run() {
  //     // 		return ['$boot', []]
  //     // 	}
  //     // })
  //   };
  // }

  type FishWorld = TFishWorld<TFishWorld>
 

  function makePhases<W extends PhaseMap>(impl: PhaseMapImpl<MachineContext, W>) {
    return impl;
  }
  
  
	const fishWorld = makeWorld<TFishWorld<TFishWorld>>()({
		contextFac: x => x,
		phases: {
      $boot: bootPhase(),
      $end: endPhase(),
      $wait: waitPhase(),
      
      trout: x => ({
        guard(d): d is [number] { return true },
        async run() {
          return ['$wait', [123, ['trout', [55]]]];
          // return ['trout', [123]];
        }
      })
		}
	})

	
  const rodentWorld = makeWorld<TRodentWorld<TRodentWorld>>()({
		contextFac: x => x,
		phases: {
      $boot: bootPhase(),
      $end: endPhase(),
      $wait: waitPhase(),

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
			},

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


//---------------------------------

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

function commitsOnly(): OperatorFunction<Emit<any>, Commit<Data>> {
	return flatMap(l => {
		if(l[0] == $Commit) {
			return [<[typeof $Commit, AtomRef<Data>]>l];
		}
		else {
			return [];
		}
	})
}

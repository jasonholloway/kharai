import { List, Map } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, SpecWorld, makeWorld, World, MachineContext, Phase, PhaseMap, WorldImpl, PhaseImpl } from '../src/lib'
import { OperatorFunction } from 'rxjs'
import { flatMap } from 'rxjs/operators'
import { buildDispatch } from '../src/dispatch'
import { delay } from '../src/util'
import { AtomRef, Atom } from '../src/atoms'
import { isString, isArray } from 'util'
import { AtomEmit, $Commit } from '../src/Committer'
import { gather } from './helpers'
import { Emit, MachineLoader, MachineSpace } from '../src/MachineSpace'
import MonoidData from '../src/MonoidData'

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

const watchPhase = <W extends World>(): PhaseImpl<W, MachineContext, [Id, string, Phase<W>]> =>
  (x => ({
    guard(d: any): d is [Id, string, Phase<W>] { return true },
    async run([id, pred, next]) {
      return next;
    }
  }));


function scenario<W extends PhaseMap, X>(world: WorldImpl<W, X>) {
  return () => {
    const atoms = new AtomSpace<Data>();

    const loader: MachineLoader<Phase<W>> = async ([id]) => {
      return Map({ [isArray(id) ? id[0] : id]: [atoms.spawnHead()] });
    }

    const dispatch = buildDispatch(world.phases);
    const space = new MachineSpace(world, loader, dispatch, ['$boot', []])
    const run = space.newRun();

    return {
      atoms, loader, dispatch, space, run
    }
  }
}


// type Hamsters = SpecWorld<{
//   $boot: []
//   $end: [any]
//   nibble: [string, number]
//   think: [string[]]
// }>

// const hamsters = makeWorld<Hamsters>()({
//   contextFac: x => x,
//   phases: {
//     $boot: bootPhase(),
//     $end: endPhase(),
//     nibble: x => ({
//       guard(d): d is [string, number] { return true },
//       async run([d, n]) {
//         return n > 0
//           ? ['nibble', [(n%2==0) ? 'bars' : 'carrot', n-1]]
//           : false;
//       }
//     }),
//     think: x => ({
//       guard(d): d is [string[]] { return true },
//       async run([memory], all) {
//         await delay(10);

//         if(!all || !all.mouth) return false;
        
//         return ['think', [[...memory, `${all.mouth[0]} ${all.mouth[1][0]}`]]]
//       }
//     })
//   }
// });


// describe('compartments', () => {

//   const fac = scenario(hamsters);
//   let x: ReturnType<typeof fac>
  
//   beforeEach(() => {
//     x = fac();
//     // x.space.log$.subscribe(console.log)
//   })  

//   it('can summon compartment', async () => {
//     const [logs] = await Promise.all([
//       gather(x.run.log$.pipe(phasesOnly())),
//       x.run.boot(['hammy', 'mouth'], ['nibble', ['carrot', 2]]),
//       x.run.boot(['hammy', 'mind'], ['think', [[]]])
//     ]);


//     console.log(logs);
//   })
// })



describe('machines: running', () => {

  const fac = scenario(rodents());
  let x: ReturnType<typeof fac>
  
  beforeEach(() => {
    x = fac();
  })  

  it('run through phases', async () => {
    const [logs] = await Promise.all([
      gather(x.run.log$.pipe(phasesOnly())),
      x.run.boot('bob', ['rat', ['wake', []]])
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
      gather(x.run.log$.pipe(phasesOnly())),
      x.run.boot('nib', ['hamster', ['wake', [77]]]),
      x.run.boot('bob', ['rat', ['wake', []]])
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
      gather(x.run.log$.pipe(phasesOnly())),
      x.run.boot('gaz', ['guineaPig', ['runAbout', []]]),
      x.run.boot('goz', ['guineaPig', ['gruntAt', ['gaz']]])
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
    const fac = scenario(rodents());
    let x: ReturnType<typeof fac>
    let logs: AtomEmit<Data>[]
    let atoms: Atom<Data>[]

    beforeEach(async () => {
      x = fac();
			const gatheringLogs = gather(x.space.log$.pipe(commitsOnly()));
			
      await Promise.all([
        x.run.log$.toPromise(),
        x.run.boot('gaz', ['guineaPig', ['runAbout', []]]),
        x.run.boot('goz', ['guineaPig', ['gruntAt', ['gaz']]])
      ]);

			x.space.complete();
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

  describe('watching', () => {
    type TBirds<Me extends World = World> = SpecWorld<{
      $boot: []
      $end: [any]
      // $watch: [Id, string, Phase<Me>]

      kestrel: {
        watch: [Id]
      }
      stoat: {
        runAround: [number]
      }
    }>

    type Birds = TBirds<TBirds>

    const birds = makeWorld<Birds>()({
      contextFac: x => x,
      phases: {
        $boot: bootPhase(),
        $end: endPhase(),

        kestrel: {
          watch: x => ({
            guard(d): d is [Id] { return true },
            async run([id]) {
              const frames = await gather(x.watch(id));
              return ['$end', [frames]];
            }
          })
        },

        stoat: {
          runAround: x => ({
            guard(d): d is [number] { return true },
            async run([n]) {
              if(n > 0) {
                await delay(10);
                return ['stoat', ['runAround', [n-1]]]
              }

              return false;
            }
          })
        }
      }
    })


    const fac = scenario(birds);
    let x: ReturnType<typeof fac>
    
    beforeEach(() => {
      x = fac();
    })

    it('one can watch the other', async () => {
      const [logs] = await Promise.all([
      	gather(x.run.log$.pipe(phasesOnly())),
      	x.run.boot('Kes', ['kestrel', ['watch', ['Seb']]]),
      	x.run.boot('Seb', ['stoat', ['runAround', [3]]])
      ]);

      console.log(logs);
      throw 123;
    })

  })
	

	type TFish<Me extends World = World> = SpecWorld<{
    $boot: []
    $end: [any]
    $wait: [number, Phase<Me>]

    trout: [number]
	}>

  type Fish = TFish<TFish>
  
	const fish = makeWorld<Fish>()({
		contextFac: x => x,
		phases: {
      $boot: bootPhase(),
      $end: endPhase(),
      $wait: waitPhase(),
      
      trout: x => ({
        guard(d): d is [number] { return true },
        async run() {
          return ['$wait', [123, ['trout', [55]]]];
        }
      })
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

type TRodents<Me extends World = World> = SpecWorld<{
  $boot: []
  $end: [any]
  $wait: [number, Phase<Me>]

  rat: {
    wake: [],
    squeak: [number]
  }

  hamster: {
    wake: [number]
    nibble: []
  }

  guineaPig: {
    runAbout: []
    gruntAt: [Id]
  }
}>

type Rodents = TRodents<TRodents>

function rodents() {
  return makeWorld<TRodents<TRodents>>()({
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
}

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
		if(isString(l[0]) || (isArray(l[0]) && isString(l[0][0]) && isString(l[0][1]))) {
			return [<[Id, any]>l];
		}
		else {
			return [];
		}
	})
}

function commitsOnly(): OperatorFunction<Emit<any>, AtomEmit<Data>> {
	return flatMap(l => {
		if(l[0] == $Commit) {
			return [<[typeof $Commit, AtomRef<Data>]>l];
		}
		else {
			return [];
		}
	})
}

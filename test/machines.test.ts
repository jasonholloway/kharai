import { List, Map } from 'immutable'
import _Monoid from '../src/_Monoid'
import Store from '../src/Store'
import AtomSpace from '../src/AtomSpace'
import AtomSaver from '../src/AtomSaver'
import { Id, Data, SpecWorld, makeWorld, World, MachineContext, Phase, _Phase } from '../src/lib'
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

	it('one can watch the other', async () => {
		const [logs] = await Promise.all([
			gather(run.log$.pipe(phasesOnly())),
			run.boot('maz', ['mink', ['eatFrog', []]]),
			run.boot('moz', ['mink', ['watch', ['maz']]])
		]);

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

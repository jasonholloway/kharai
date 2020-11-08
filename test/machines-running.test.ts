import _Monoid from '../src/_Monoid'
import { scenario } from './shared'
import { rodents } from './worlds/rodents'

describe('machines - running', () => {
  const fac = scenario(rodents());
  let x: ReturnType<typeof fac>
  
  beforeEach(() => {
    x = fac();
  })  

  it('run through phases', async () => {
    const [logs] = await Promise.all([
      x.logs(),
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
      x.logs(),
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
      x.logs(),
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
})


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



	// type TFish<Me extends World = World> = SpecWorld<{
  //   $boot: []
  //   $end: [any]
  //   $wait: [number, Phase<Me>]

  //   trout: [number]
	// }>

  // type Fish = TFish<TFish>
  
	// const fish = makeWorld<Fish>()({
	// 	contextFac: x => x,
	// 	phases: {
  //     $boot: bootPhase(),
  //     $end: endPhase(),
  //     $wait: waitPhase(),
      
  //     trout: x => ({
  //       guard(d): d is [number] { return true },
  //       async run() {
  //         return ['$wait', [123, ['trout', [55]]]];
  //       }
  //     })
	// 	}
	// })

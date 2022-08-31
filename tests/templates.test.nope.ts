// THIS IS COMMENTED OUT TEMPORARILY!
// for the future...

// import _Monoid from '../src/_Monoid'
// import { act } from '../src/shape/common';
// import { World } from '../src/shape/World';
// import { createRunner } from './shared'
// import { Str } from '../src/guards/Guard'

// const animal = (says:string) =>
//   World
//     .shape({
//       hello: act(),
//       walk: act(Str)
//     })
//     .impl({
//       async hello({and}) {
//         return and.walk(says);
//       },

//       async walk({and}, d) {
//         return and.end(d);
//       }
//     });


// const Template = {
//   shape<S>(s:S) {
//     return Template;
//   },

//   args() {
//     return Template;
//   },

//   impl<I>(i:I) {
//     return Template;
//   }
// };

// const vegetable = (tastes:string) =>
//   Template
//     .shape({
//       sits: act()
//     })
//     .param({
      
//     })
//     .impl({
//       async sits({and}) {
//         return and.end(tastes);
//       }
//     });


// const world = World
//   .with(animal('oink').as('pig'))
//   .with(animal('woof').as('dog'))
//   .shape({
//     speakToAnimals: act(),

//     pig: animal('oink'),
//     dog: animal('woof'),

//     turnip: vegetable('nice')
//   })
//   .impl({
//     async speakToAnimals({and}) {
//       return and.pig.hello();
//     }
//   })
//   .tmpl({
//     turnip({create,and}) {
//       return create(and.pig.hello());
//     }
//   })
// ;

// describe('worlds', () => {

//   it('run through phases', async () => {
//     const x = createRunner(world.build());
    
//     const [logs] = await Promise.all([
//       x.allLogs(),
//       x.run.boot('bob', ['speakToAnimals'])
//     ]);

//     expect(logs).toEqual([
//       ['bob', ['boot']],
//       ['bob', ['speakToAnimals']],
//       ['bob', ['pig_hello']],
//       ['bob', ['pig_walk', 'oink']],
//       ['bob', ['end', 'oink']],
//     ]);
//   })
// })

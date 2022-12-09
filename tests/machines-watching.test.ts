import _Monoid from '../src/_Monoid'
import { createRunner, showData } from './shared';
import { Map } from 'immutable'
import { World } from '../src/shape/World';
import { Any, Num, Str } from '../src/guards/Guard';
import { act } from '../src/shape/common';
import { take, toArray } from 'rxjs/operators'
import { delay } from '../src/util';

//it's nice for builtins to have their own prefix
//that was kind of the point of the 'M' after all
//but to use a different prefix, PhaseHelper in particular needs to be wise to it
//and first... I should clean up the context types...


describe('machines - watching', () => {

	describe('watches', () => {

		const animals = World
			.shape({
				runAround: act(Num),
				pauseThenRunAround: act(Num),
				follow: act([Str, Num] as const),
			})
			.impl({
				async runAround({and}, n) {
					return n > 0 && and.runAround(n-1);
				},

				async pauseThenRunAround({and}, n) {
					await delay(200);
					return and.runAround(n);
				},

				async follow({and, watchRaw}, [id, c]) {
					const frames = await watchRaw(id)
						.pipe(take(c), toArray())
						.toPromise();

					return and.end(frames);
				}
			});

		it('one can watch the other', async () => {
			const x = createRunner(animals.build());

			const [cat] = await Promise.all([
				x.logs('Cat'),
				x.run.boot('Mouse', ['M_runAround', 3]),
				x.run.boot('Cat', ['M_follow', ['Mouse', 10]]),
			]);

			const [,seen] = cat.find(([p]) => p == '*_end')!;

			expect(seen).toEqual([
				['M_runAround', 3],
				['M_runAround', 2],
				['M_runAround', 1],
				['M_runAround', 0]
			])
		})

		it('loaded state immediately visible; implies dispatch', async () => {
			const x = createRunner(animals.build(), {
				data: Map({
					Gwen: ['M_pauseThenRunAround', 13]
				}),
				save: false
			});

			await Promise.all([
				x.run.boot('Gareth', ['M_follow', ['Gwen', 3]]),
				x.run.log$.toPromise()
			]);

			const gareth = x.view('Gareth');

			expect(showData(gareth[1]))
				.toHaveProperty('Gareth', 
					['*_end', [
						['M_pauseThenRunAround', 13],
						['M_runAround', 13],
						['M_runAround', 12]
					]]
				);
		})

		// it('can watch several at once', async () => {
		// 	const x = createRunner(animals.build());

		// 	await Promise.all([
		// 		x.run.boot('Kes', ['follow', [['Biff', 'Kipper'], 4]]),
		// 		x.run.boot('Biff', ['runAround', 11]),
		// 		x.run.boot('Kipper', ['runAround', 22]),
		// 		x.run.log$.toPromise()
		// 	]);

		// 	const kesLogs = await x.logs('Kes');
		// 	const seen = kesLogs.find(l => l[0] == 'end')?.[1];

		// 	expect(seen).toEqual([
		// 		['Biff', ['runAround', 11]],
		// 		['Kipper', ['runAround', 22]],
		// 		['Biff', ['runAround', 10]],
		// 		['Kipper', ['runAround', 21]]
		// 	])
		// })

		it('tracks causality in atom tree', async () => {
			const x = createRunner(animals.build(), { save: false });

			await Promise.all([
				x.run.boot('Gord', ['M_runAround', 1]),
				x.run.boot('Ed', ['M_follow', ['Gord', 1]]),
				x.run.log$.toPromise()
			]);

			const gord =	x.view('Gord');
			const ed = x.view('Ed');

			expect(gord[1].parents())
				.toEqual([
					gord[0]
				])

			expect(ed[1].parents())
				.toEqual([
					ed[0],
					gord[0]
				])
		})

		it('past phases of target aren\'t seen', async () => {
			const x = createRunner(animals.build(), { save: false });

			await Promise.all([
				x.run.boot('Gord', ['M_runAround', 2]),
				x.run.boot('Ed', ['M_*wait', [100, ['M_follow', ['Gord', 1]]]])
			]);

			const logs = await x.allLogs();

			expect(logs).toEqual([
				['Gord', ['*_boot']],
				['Ed', ['*_boot']],
				['Gord', ['M_runAround', 2]],
				['Ed', ['*_wait', [100, ['M_follow', ['Gord', 1]]]]],
				['Gord', ['M_runAround', 1]],
				['Gord', ['M_runAround', 0]],
				['Ed', ['M_follow', ['Gord', 1]]],
				['Ed', ['*_end', [['M_runAround', 0]]]],
			]);
		})
	});


	describe('views', () => {

		const starlings = World
			.shape({
				hopAbout: act(Num),
				chirp: act(Num),

				view: act([Str, Num] as const),
				seen: act(Any)
			})
			.impl({
				async hopAbout({and}, n) {
					if(n >= 6) return false;

					if(n % 3 == 2) {
						return and.chirp(n+1);
					}

					return and.hopAbout(n+1);
				},

				chirp: {
					async act({and}, n) {
						if(n >= 6) return false;

						return and.hopAbout(n+1);
					},

					show: (n) => [`chirp ${n}!`]
				},

				async view({and,watch}, [id, c]) {
					const frames = await watch(id)
						.pipe(take(c), toArray())
						.toPromise();

					return and.seen(frames);
				},

				async seen() {
					return false;
				}
			});


		it('view offered projections', async () => {
			const x = createRunner(starlings.build(), { save: false });

			const [logs] = await Promise.all([
				x.allLogs(),
				x.run.boot('bob', ['M_hopAbout', 0]),
				x.run.boot('babs', ['M_view', ['bob', 2]])
			]);

			expect(logs).toEqual([
				['bob', ['*_boot']],
				['babs', ['*_boot']],
				['bob', ['M_hopAbout', 0]],
				['babs', ['M_view', ['bob', 2]]],
				['bob', ['M_hopAbout', 1]],
				['bob', ['M_hopAbout', 2]],
				['bob', ['M_chirp', 3]],
				['bob', ['M_hopAbout', 4]],
				['bob', ['M_hopAbout', 5]],
				['bob', ['M_chirp', 6]],
				['babs', ['M_seen', [
					'chirp 3!',
					'chirp 6!'
				]]]
			]);
		})
	})

})

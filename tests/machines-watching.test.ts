import _Monoid from '../src/_Monoid'
import { createRunner, showData } from './shared';
import { Map } from 'immutable'
import { World } from '../src/shape/World';
import { Any, Many, Num, Str } from '../src/guards/Guard';
import { act } from '../src/shape/common';
import { map, take, toArray } from 'rxjs/operators'
import { delay } from '../src/util';

describe('machines - watching', () => {

	describe('watches', () => {

		const animals = World
			.shape({
				runAround: act(Num),
				runAroundAfterDelay: act(Num),
				follow: act([Many(Str), Num] as const),
			})
			.impl({
				async runAround({and}, n) {
					return n > 0 && and.runAround(n-1);
				},

				async runAroundAfterDelay({and}, n) {
					await delay(200);
					return n > 0 && and.runAround(n-1);
				},

				async follow({and, watchRaw}, [ids, c]) {
					const frames = await watchRaw(ids)
						.pipe(take(c), map(m => m.toObject()), toArray())
						.toPromise();

					return and.end(frames);
				}
			});

		it('one can watch the other', async () => {
			const x = createRunner(animals.build());

			const [cat] = await Promise.all([
				x.logs('Cat'),
				x.run.boot('Mouse', ['runAround', 3]),
				x.run.boot('Cat', ['follow', [['Mouse'], 10]]),
			]);

			const [,seen] = cat.find(([p]) => p == 'end')!;

			expect(seen).toEqual([
				{ Mouse: ['runAround', 3] },
				{ Mouse: ['runAround', 2] },
				{ Mouse: ['runAround', 1] },
				{ Mouse: ['runAround', 0] }
			])
		})

		it('loaded state immediately visible; implies dispatch', async () => {
			const x = createRunner(animals.build(), {
				data: Map({
					Gwen: ['runAroundAfterDelay', 13]
				}),
				save: false
			});

			await Promise.all([
				x.run.boot('Gareth', ['follow', [['Gwen'], 2]]),
				x.run.log$.toPromise()
			]);

			const gareth = x.view('Gareth');

			expect(showData(gareth[1]))
				.toHaveProperty('Gareth', 
					['end', [
						{ Gwen: ['runAroundAfterDelay', 13] },
						{ Gwen: ['runAround', 12] }
					]]
				);
		})

		it('can watch several at once', async () => {
			const x = createRunner(animals.build());

			await Promise.all([
				x.run.boot('Kes', ['follow', [['Biff', 'Kipper'], 4]]),
				x.run.boot('Biff', ['runAround', 11]),
				x.run.boot('Kipper', ['runAround', 22]),
				x.run.log$.toPromise()
			]);

			const kesLogs = await x.logs('Kes');
			const seen = kesLogs.find(l => l[0] == 'end')?.[1];

			expect(seen).toEqual([
				['Biff', ['runAround', 11]],
				['Kipper', ['runAround', 22]],
				['Biff', ['runAround', 10]],
				['Kipper', ['runAround', 21]]
			])
		})

		it('tracks causality in atom tree', async () => {
			const x = createRunner(animals.build(), { save: false });

			await Promise.all([
				x.run.boot('Gord', ['runAround', 1]),
				x.run.boot('Ed', ['follow', [['Gord'], 1]]),
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
				x.run.boot('Gord', ['runAround', 2]),
				x.run.boot('Ed', ['wait', [100, ['follow', [['Gord'], 1]]]])
			]);

			const logs = await x.allLogs();

			expect(logs).toEqual([
				['Gord', ['boot']],
				['Ed', ['boot']],
				['Gord', ['runAround', 2]],
				['Ed', ['wait', [100, ['follow', [['Gord'], 1]]]]],
				['Gord', ['runAround', 1]],
				['Gord', ['runAround', 0]],
				['Ed', ['follow', [['Gord'], 1]]],

				['Ed', ['end', [['Gord', ['runAround', 0]]]]],
			]);
		})
	});


	describe('views', () => {

		const starlings = World
			.shape({
				hopAbout: act(Num),
				chirp: act(Num),

				view: act([Many(Str), Num] as const),
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

				async view({and,watch}, [ids, c]) {
					const frames = await watch(ids)
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
				x.run.boot('bob', ['hopAbout', 0]),
				x.run.boot('babs', ['view', [['bob'], 2]])
			]);

			expect(logs).toEqual([
				['bob', ['boot']],
				['babs', ['boot']],
				['bob', ['hopAbout', 0]],
				['babs', ['view', [['bob'], 2]]],
				['bob', ['hopAbout', 1]],
				['bob', ['hopAbout', 2]],
				['bob', ['chirp', 3]],
				['bob', ['hopAbout', 4]],
				['bob', ['hopAbout', 5]],
				['bob', ['chirp', 6]],
				['babs', ['seen', [
					['bob', 'chirp 3!'],
					['bob', 'chirp 6!']
				]]]
			]);
		})
	})

})

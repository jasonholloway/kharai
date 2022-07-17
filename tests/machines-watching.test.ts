import _Monoid from '../src/_Monoid'
import { createRunner } from './shared';
import { birds } from './worlds/birds'
import { Map } from 'immutable'

describe('machines - watching', () => {
	const world = birds.build();

	it('one can watch the other', async () => {
		const x = createRunner(world, { save:false });

		await Promise.all([
			x.run.boot('Kes', ['track', [['Stu'], 100]]),
			x.run.boot('Stu', ['runAround', 3]),
			x.run.log$.toPromise()
		]);

		const kes = await x.logs('Kes');
		const [,seen] = kes.find(([p]) => p == '$end')!;

		expect(seen).toEqual([
			['Stu', ['runAround', 3]],
			['Stu', ['runAround', 2]],
			['Stu', ['runAround', 1]],
			['Stu', ['runAround', 0]]
		])
	})

	it('loaded state immediately visible; implies dispatch', async () => {
		const x = createRunner(world, {
			loader: ids => Promise.resolve(
				ids.reduce(
					(ac, id) => ac.set(id, id == 'Gwen' ? ['runAround', 13] : ['$boot']),
					Map())),
			save: false
		});

		await Promise.all([
			x.run.boot('Gareth', ['track', [['Gwen'], 2]]),
			x.run.log$.toPromise()
		]);

		const gareth = x.view('Gareth');
		const [p, d] = gareth[1].val().get('Gareth');

		expect(p).toEqual('$end');

		expect(d).toEqual([
			['Gwen', ['runAround', 13]],
			['Gwen', ['runAround', 12]]
		])
	})

	it('can watch several at once', async () => {
		const x = createRunner(world, { save:false });

		await Promise.all([
			x.run.boot('Kes', ['track', [['Biff', 'Kipper'], 4]]),
			x.run.boot('Biff', ['runAround', 11]),
			x.run.boot('Kipper', ['runAround', 22]),
			x.run.log$.toPromise()
		]);

		const kesLogs = await x.logs('Kes');
		const seen = kesLogs.find(l => l[0] == '$end')?.[1];

		expect(seen).toEqual([
			['Biff', ['runAround', 11]],
			['Kipper', ['runAround', 22]],
			['Biff', ['runAround', 10]],
			['Kipper', ['runAround', 21]]
		])
	})


	it('tracks causality in atom tree', async () => {
		const x = createRunner(world, { save:false });

		await Promise.all([
			x.run.boot('Gord', ['runAround', 1]),
			x.run.boot('Ed', ['track', [['Gord'], 1]]),
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
		const x = createRunner(world, { save:false });

		await Promise.all([
			x.run.boot('Gord', ['runAround', 2]),
			x.run.boot('Ed', ['$wait', [100, ['track', [['Gord'], 1]]]])
		]);

		const logs = await x.allLogs();

    expect(logs).toEqual([
			['Gord', ['$boot']],
			['Ed', ['$boot']],
			['Gord', ['runAround', 2]],
			['Ed', ['$wait', [100, ['track', [['Gord'], 1]]]]],
			['Gord', ['runAround', 1]],
			['Gord', ['runAround', 0]],
			['Ed', ['track', [['Gord'], 1]]],

			['Ed', ['$end', [['Gord', ['runAround', 0]]]]],
		]);
	})

})

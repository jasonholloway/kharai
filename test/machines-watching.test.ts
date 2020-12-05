import { List, Map } from 'immutable'
import _Monoid from '../src/_Monoid'
import { delay } from '../src/util'
import { scenario } from './shared'
import { birds } from './worlds/birds'

const log = console.log;

describe('machines - watching', () => {
	const fac = scenario(birds);
	let x: ReturnType<typeof fac>

	it('one can watch the other', async () => {
		x = fac({ save: false });

		const [logs] = await Promise.all([
			x.logs(),
			x.run.boot('Kes', ['track', [['Stu'], 100]]),
			x.run.boot('Stu', ['runAround', [3]]),
			x.run.log$.toPromise()
		]);

		const seen = List(logs)
			.flatMap(([id, [p]]) =>
				(id == 'Kes' && p && p[0] == '$end') ? p[1] : [])
			.toArray()

		expect(seen).toEqual([
			{ Stu: ['runAround', [3]] },
			{ Stu: ['runAround', [2]] },
			{ Stu: ['runAround', [1]] },
			{ Stu: ['runAround', [0]] }
		])
	})

	it('loaded state immediately visible; implies dispatch', async () => {
		x = fac({
			phases: Map({
				Gwen: ['runAround', [13]]
			}),
			save: false
		});

		await Promise.all([
			x.run.boot('Gareth', ['track', [['Gwen'], 2]]),
			x.run.log$.toPromise()
		]);

		const gareth = x.view('Gareth');
		const [p, [d]] = gareth[1].val().get('Gareth');

		expect(p).toEqual('$end');

		expect(d).toEqual([
			{ Gwen: ['runAround', [13]] },
			{ Gwen: ['runAround', [12]] }
		])
	})

	it('can watch several at once', async () => {
		x = fac({ save: false });

		const [logs] = await Promise.all([
			x.logs(),
			x.run.boot('Kes', ['track', [['Biff', 'Kipper'], 4]]),
			x.run.boot('Biff', ['runAround', [11]]),
			x.run.boot('Kipper', ['runAround', [22]]),
			x.run.log$.toPromise()
		]);

		const seen = List(logs)
			.flatMap(([id, [p]]) =>
				(id == 'Kes' && p && p[0] == '$end') ? p[1] : [])
			.toArray()

		expect(seen).toEqual([
			{ Biff: ['runAround', [11]] },
			{ Kipper: ['runAround', [22]] },
			{ Biff: ['runAround', [10]] },
			{ Kipper: ['runAround', [21]] }
		])
	})


	it('tracks causality in atom tree', async () => {
		x = fac({ save: false });

		await Promise.all([
			x.run.boot('Gord', ['runAround', [1]]),
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

	it('past atoms of target aren\'t seen', async () => {
		x = fac({ save: false });

		x.run.boot('Gord', ['runAround', [3]]);
		x.run.boot('Snoozy', ['sleep', [200]]);  // keeps run alive
		await delay(100);

		const [logs] = await Promise.all([
			x.logs(),
			x.run.boot('Ed', ['track', [['Gord'], 1]]),
		]);

		expect(logs[2]).toEqual(
			['Ed', ['$end', [[ Map({ Gord: ['runAround', [0]] }) ]] ]]
		);
	})

})

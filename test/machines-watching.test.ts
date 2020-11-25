import { List, Map } from 'immutable'
import _Monoid from '../src/_Monoid'
import { Data } from '../src/lib'
import { delay } from '../src/util'
import { scenario, getAtoms } from './shared'
import { birds } from './worlds/birds'

describe('machines - watching', () => {
	const fac = scenario(birds);
	let x: ReturnType<typeof fac>

	it('one can watch the other', async () => {
		x = fac();

		const [logs] = await Promise.all([
			x.logs(),
			x.run.boot('Kes', ['track', [['Stu'], 100]]),
			x.run.boot('Stu', ['runAround', [3]])
		]);

		const seen = List(logs)
			.flatMap(([id, [p, [d]]]) =>
				(id == 'Kes' && p == '$end') ? <Data[]>d : [])
			.map(m => m.toObject())
			.toArray()

		expect(seen).toEqual([
			{ Stu: ['runAround', [3]] },
			{ Stu: ['runAround', [2]] },
			{ Stu: ['runAround', [1]] },
			{ Stu: ['runAround', [0]] }
		])
	})

	it('loaded state immediately visible; implies dispatch', async () => {
		x = fac(Map({
			Gwen: ['runAround', [13]]
		}));

		const [logs] = await Promise.all([
			x.logs(),
			x.run.boot('Gareth', ['track', [['Gwen'], 2]]),
		]);

		const seen = List(logs)
			.flatMap(([id, [p, [d]]]) =>
				(id == 'Gareth' && p == '$end') ? <Data[]>d : [])
			.map(m => m.toObject())
			.toArray()

		expect(seen).toEqual([
			{ Gwen: ['runAround', [13]] },
			{ Gwen: ['runAround', [12]] }
		])
	})

	it('can watch several at once', async () => {
		x = fac();

		const [logs] = await Promise.all([
			x.logs(),
			x.run.boot('Kes', ['track', [['Biff', 'Kipper'], 4]]),
			x.run.boot('Biff', ['runAround', [11]]),
			x.run.boot('Kipper', ['runAround', [22]])
		]);

		const seen = List(logs)
			.flatMap(([id, [p, [d]]]) =>
				(id == 'Kes' && p == '$end') ? <Data[]>d : [])
			.map(m => m.toObject())
			.toArray()

		expect(seen).toEqual([
			{ Biff: ['runAround', [11]] },
			{ Kipper: ['runAround', [22]] },
			{ Biff: ['runAround', [10]] },
			{ Kipper: ['runAround', [21]] }
		])
	})


	it('tracks causality in atom tree', async () => {
		x = fac();

		const [gordAtoms, edAtoms] = await Promise.all([
			x.atoms('Gord'),
			x.atoms('Ed'),
			x.logs(),
			x.run.boot('Gord', ['runAround', [1]]),
			x.run.boot('Ed', ['track', [['Gord'], 1]])
		]);

		expect(getAtoms(gordAtoms[1].parents))
			.toEqual([
				gordAtoms[0]
			])

		expect(getAtoms(edAtoms[1].parents))
			.toEqual([
				edAtoms[0],
				gordAtoms[0]
			])
	})

	it('past atoms of target aren\'t seen', async () => {
		x = fac();

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

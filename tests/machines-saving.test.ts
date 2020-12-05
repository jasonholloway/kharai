import _Monoid from '../src/_Monoid'
import { scenario } from './shared'
import { rodents } from './worlds/rodents'
import { Map, Set, List } from 'immutable'
const log = console.log;

describe('machines - saving', () => {
	const fac = scenario(rodents());
	let x: ReturnType<typeof fac>

	it('atoms conjoin without consolidation (no saver or rewrites)', async () => {
		x = fac({ save: false });

		await Promise.all([
			x.run.boot('baz', ['guineaPig', ['runAbout', []]]),
			x.run.boot('loz', ['guineaPig', ['gruntAt', ['baz']]]),
			x.run.log$.toPromise()
		]);

		const baz = x.view('baz');
		const loz = x.view('loz');

		expect(baz.map(a => a.val().toObject()))
			.toEqual([
				{
					baz: ['guineaPig', ['runAbout', []]]
				},
				{
					baz: ['$end', ['grunt!']],
					loz: ['$end', ['squeak!']]
				}
			]);

		expect(baz[0].parents()).toHaveLength(0);
		expect(baz[1].parents()).toContainEqual(baz[0]);
		expect(baz[1].parents()).toContainEqual(loz[0]);

		expect(loz.map(a => a.val().toObject()))
			.toEqual([
				{
					loz: ['guineaPig', ['gruntAt', ['baz']]]
				},
				{
					baz: ['$end', ['grunt!']],
					loz: ['$end', ['squeak!']]
				}
			]);

		expect(loz[0].parents()).toHaveLength(0);
		expect(loz[1].parents()).toContainEqual(loz[0]);
		expect(loz[1].parents()).toContainEqual(baz[0]);
	})

	it('atoms consolidated (via saver)', async () => {
		x = fac();

		await Promise.all([
			x.run.boot('baz', ['guineaPig', ['runAbout', []]]),
			x.run.boot('loz', ['guineaPig', ['gruntAt', ['baz']]]),
			x.run.log$.toPromise()
		]);

		const baz = x.view('baz');
		const loz = x.view('loz');

		expect(baz).toHaveLength(1);
		expect(baz[0].val().toObject()).toEqual({
			baz: ['$end', ['grunt!']],
			loz: ['$end', ['squeak!']]
		});
		expect(baz[0].parents()).toHaveLength(0);

		expect(loz).toHaveLength(1);
		expect(loz[0].val().toObject()).toEqual({
			baz: ['$end', ['grunt!']],
			loz: ['$end', ['squeak!']]
		});
		expect(loz[0].parents()).toHaveLength(0);
	})

	it('doesn\'t save $boots', async () => {
		x = fac({ batchSize: 2 });

		await Promise.all([
			x.run.boot('a', ['gerbil', ['spawn', [0, 2]]]),
			x.run.log$.toPromise()
		]);

		expect([...List(x.store.batches)
			.flatMap(b => b.valueSeq())
			.map(a => a[0])])
			.not.toContain('$boot')
	})

	xit('too small batch size throws error', async () => {
		x = fac({ batchSize: 1 });

		await Promise.all([
			x.run.boot('m', ['gerbil', ['spawn', [0, 2]]]),
			x.run.boot('a', ['gerbil', ['spawn', [0, 2]]]),
			x.run.log$.toPromise()
		]);

		throw 'TODO where will error appear?'
	})

	it('big enough batch saves once', async () => {
		x = fac({ batchSize: 24, threshold: 6 });

		await Promise.all([
			x.run.boot('m', ['gerbil', ['spawn', [0, 2]]]),
			x.run.boot('a', ['gerbil', ['spawn', [0, 2]]]),
			x.run.log$.toPromise()
		]);

		expect(x.store.batches).toHaveLength(1)
	})
	
	it('big enough batch, heads resolve to same atom', async () => {
		x = fac({ batchSize: 24, threshold: 3 });

		await Promise.all([
			x.run.boot('a', ['gerbil', ['spawn', [0, 2]]]),
			x.run.log$.toPromise()
		]);

		const [a] = x.view('a');
		const [aa] = x.view('aa');
		const [ab] = x.view('ab');

		const atoms = Set([a, aa, ab])
		  .map(v => v.unpack());

		expect(atoms.toArray()).toHaveLength(1);

		const [atom] = atoms;

		expect(Map(atom.val).keySeq().toSet())
			.toStrictEqual(Set(['a', 'aa', 'ab']));

		expect(atom).toHaveProperty('weight', 3);
	})

	xit('further saving', async () => {
		x = fac({ batchSize: 5, threshold: 4 });

		await Promise.all([
			x.run.boot('m', ['gerbil', ['spawn', [0, 2]]]),
			x.run.boot('a', ['gerbil', ['spawn', [0, 2]]]),
			x.run.log$.toPromise()
		]);

		//TODO
		//ordering of savables
	})
})

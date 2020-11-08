import _Monoid from '../src/_Monoid'
import { scenario } from './shared'
import { rodents } from './worlds/rodents'

describe('machines - saving', () => {
	const fac = scenario(rodents());
	let x: ReturnType<typeof fac>

	it('atoms conjoin', async () => {
		x = fac();

		const [gazAtoms, gozAtoms] = await Promise.all([
			x.atoms('gaz'),
			x.atoms('goz'),
			x.run.boot('gaz', ['guineaPig', ['runAbout', []]]),
			x.run.boot('goz', ['guineaPig', ['gruntAt', ['gaz']]])
		]);

		expect(gazAtoms.map(a => a.val.toObject()))
			.toEqual([
				{
					gaz: ['$boot', []]
				},
				{
					gaz: ['guineaPig', ['runAbout', []]]
				},
				{
					gaz: ['$end', ['grunt!']],
					goz: ['$end', ['squeak!']]
				}
			]);

		expect(gazAtoms[0].parents.isEmpty).toBeTruthy();
		expect(gazAtoms[1].parents.flatMap(r => r.resolve()).toArray()).toEqual([gazAtoms[0]]);
		expect(gazAtoms[2].parents.flatMap(r => r.resolve()).toArray()).toContain(gazAtoms[1]);
		expect(gazAtoms[2].parents.flatMap(r => r.resolve()).toArray()).toContain(gozAtoms[1]);

		expect(gozAtoms.map(a => a.val.toObject()))
			.toEqual([
				{
					goz: ['$boot', []]
				},
				{
					goz: ['guineaPig', ['gruntAt', ['gaz']]]
				},
				{
					gaz: ['$end', ['grunt!']],
					goz: ['$end', ['squeak!']]
				}
			]);

		expect(gozAtoms[0].parents.isEmpty).toBeTruthy();
		expect(gozAtoms[1].parents.flatMap(r => r.resolve()).toArray()).toEqual([gozAtoms[0]]);
		expect(gozAtoms[2].parents.flatMap(r => r.resolve()).toArray()).toContain(gozAtoms[1]);
		expect(gozAtoms[2].parents.flatMap(r => r.resolve()).toArray()).toContain(gazAtoms[1]);
	})
})

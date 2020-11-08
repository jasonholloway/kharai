import _Monoid from '../src/_Monoid'
import { scenario, getAtoms } from './shared'
import { rodents } from './worlds/rodents'
import FakeStore from './FakeStore';
import MonoidData from '../src/MonoidData';
import { Set } from 'immutable'

describe('machines - saving', () => {
	const fac = scenario(rodents());
	let x: ReturnType<typeof fac>

	it('atoms conjoin', async () => {
		x = fac();

		const [bazAtoms, lozAtoms] = await Promise.all([
			x.atoms('baz'),
			x.atoms('loz'),
			x.run.boot('baz', ['guineaPig', ['runAbout', []]]),
			x.run.boot('loz', ['guineaPig', ['gruntAt', ['baz']]])
		]);

		expect(bazAtoms.map(a => a.val.toObject()))
			.toEqual([
				{
					baz: ['$boot', []]
				},
				{
					baz: ['guineaPig', ['runAbout', []]]
				},
				{
					baz: ['$end', ['grunt!']],
					loz: ['$end', ['squeak!']]
				}
			]);

		expect(bazAtoms[0].parents.isEmpty).toBeTruthy();
		expect(getAtoms(bazAtoms[1].parents)).toEqual([bazAtoms[0]]);
		expect(getAtoms(bazAtoms[2].parents)).toContain(bazAtoms[1]);
		expect(getAtoms(bazAtoms[2].parents)).toContain(lozAtoms[1]);

		expect(lozAtoms.map(a => a.val.toObject()))
			.toEqual([
				{
					loz: ['$boot', []]
				},
				{
					loz: ['guineaPig', ['gruntAt', ['baz']]]
				},
				{
					baz: ['$end', ['grunt!']],
					loz: ['$end', ['squeak!']]
				}
			]);

		expect(lozAtoms[0].parents.isEmpty).toBeTruthy();
		expect(getAtoms(lozAtoms[1].parents)).toEqual([lozAtoms[0]]);
		expect(getAtoms(lozAtoms[2].parents)).toContain(lozAtoms[1]);
		expect(getAtoms(lozAtoms[2].parents)).toContain(bazAtoms[1]);
	})

	it('saving', async () => {
		x = fac();

		const [bazAtoms, lozAtoms] = await Promise.all([
			x.atoms('baz'),
			x.atoms('loz'),
			x.run.boot('baz', ['guineaPig', ['runAbout', []]]),
			x.run.boot('loz', ['guineaPig', ['gruntAt', ['baz']]])
		]);


		//HOW TO SAVE HEADS (they are internal)
		//?????
		

		
		const store = new FakeStore(new MonoidData(), 5);
		
		await x.saver.save(store, Set())

		
		//what would even save?
		//the scenario needs a saver
		//
		//
		//
		
	})
})

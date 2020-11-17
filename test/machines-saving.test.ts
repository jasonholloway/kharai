import _Monoid from '../src/_Monoid'
import { scenario, getAtoms } from './shared'
import { rodents } from './worlds/rodents'
import FakeStore from './FakeStore';
import MonoidData from '../src/MonoidData';
import { Set } from 'immutable'
import { flatMap, take, map } from 'rxjs/operators';
import { gather, delay } from './helpers';

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

		const store = new FakeStore(new MonoidData(), 5);
		
		//where to find the heads?
		//they will only be available within the MachineSpace

		const heads = await gather(x.space
			.summon(Set(['baz', 'loz']))
		  .pipe(flatMap(m => m.head$.pipe(take(1)))))

		await x.saver.save(store, Set(heads))
	})

	it('further saving', async () => {
		x = fac();

		const store = new FakeStore(new MonoidData(), 2);

		x.run.log$.subscribe(console.log)

		// await Promise.all([
		// 	x.atoms('jeremy'),
		// 	x.atoms('jessica'),
			x.run.boot('jeremy', ['gerbil', ['spawn', [[], 0]]]),
			x.run.boot('jessica', ['gerbil', ['spawn', [[], 0]]])
		// ]);

		//the spawned machines aren't waited of course
		//we need to somehow wait for all machines to quieten...
		//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

		console.log(1)
		const gatheringHeads = gather(x.run.machine$
			.pipe(flatMap(m => m.head$)))

		console.log(2)
		await delay(20);
		console.log(3)
		
		x.run.complete();
		console.log(4)

		const heads = await gatheringHeads;
		// console.log(heads)

		// //ABOVE IS NOT COMPLETING!!!
		// //
		// //MachineSpace needs to complete when all machines are done
		// //but isn't that more of a Run?

		// await x.saver.save(store, Set(heads))

		// console.log(store.saved)
	})
})

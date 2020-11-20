import _Monoid from '../src/_Monoid'
import { scenario, getAtoms } from './shared'
import { rodents } from './worlds/rodents'
import FakeStore from './FakeStore';
import MonoidData from '../src/MonoidData';
import { Set, List, OrderedSet } from 'immutable'
import { map } from 'rxjs/operators';
import { gather, delay } from './helpers';
const log = console.log;

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

	it('doesn\'t save $boots', async () => {
		x = fac();

		const store = new FakeStore(new MonoidData(), 2);

		await x.run.boot('aa', ['gerbil', ['spawn', [0, 4]]]);

		const gatheringHeads = gather(x.run.machine$
		  .pipe(map(m => m.head)));

		await delay(400);
		x.run.complete();

		const heads = await gatheringHeads;
		await x.saver.save(store, Set(heads))

		expect([...List(store.batches)
			.flatMap(b => b.valueSeq())
			.map(a => a[0])])
			.not.toContain('$boot')
	})

	it('further saving', async () => {
		x = fac();
		// x.run.log$.subscribe(log)

		const store = new FakeStore(new MonoidData(), 2);

		await Promise.all([
			x.run.boot('mm', ['gerbil', ['spawn', [0, 2]]]),
			x.run.boot('aa', ['gerbil', ['spawn', [0, 2]]]),
		]);

		//TODO
		//BOOTS are without parents and get gobbled up straight away by the saver
		//
		//in symettry with unnecessary saving of boots...
		//(should be flag to stop saver consuming them)
		//!!!

		//TODO
		//when batch size is not big enough...
		//gets stuck in endless loop
		//


		// log(1)
		const gatheringHeads = gather(x.run.machine$
			.pipe(map(m => m.head)))

		await delay(200);
		
		x.run.complete();
		// log(2)

		const heads = await gatheringHeads;

		//!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		//all heads, including previous ones, are being gathered
		//they should be, what? scanned for the last one? 
		//or maybe made mutable again
		//tho the idea with streaming them was to ease aggregating a sorted list
		//this 'sorted list' should though be of weighted atoms, not heads
		//though this atom weight gathers and is measured at the head
		//

		//all atoms will then have a weight (zero means not pending)
		//this weight would be both local and total/projected
		//though we have a messy late-addition method on the atom I believe
		//
		
		await x.saver.save(store, Set(heads))
		log(store.saved)
	})

	it('flump', () => {
		let set = OrderedSet();
		set = set.add(1)
		set = set.add(2)
		set = set.add(1)

		log(set)
	})
})

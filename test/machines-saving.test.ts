import _Monoid from '../src/_Monoid'
import { scenario, getAtoms } from './shared'
import { rodents } from './worlds/rodents'
import FakeStore from './FakeStore';
import MonoidData from '../src/MonoidData';
import { Set, List, OrderedSet } from 'immutable'
import { map, bufferTime, finalize, first } from 'rxjs/operators';
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
					baz: ['guineaPig', ['runAbout', []]]
				},
				{
					baz: ['$end', ['grunt!']],
					loz: ['$end', ['squeak!']]
				}
			]);

		expect(bazAtoms[0].parents.isEmpty).toBeTruthy();
		expect(getAtoms(bazAtoms[1].parents)).toContain(bazAtoms[0]);
		expect(getAtoms(bazAtoms[1].parents)).toContain(lozAtoms[0]);

		expect(lozAtoms.map(a => a.val.toObject()))
			.toEqual([
				{
					loz: ['guineaPig', ['gruntAt', ['baz']]]
				},
				{
					baz: ['$end', ['grunt!']],
					loz: ['$end', ['squeak!']]
				}
			]);

		expect(lozAtoms[0].parents.isEmpty).toBeTruthy();
		expect(getAtoms(lozAtoms[1].parents)).toContain(lozAtoms[0]);
		expect(getAtoms(lozAtoms[1].parents)).toContain(bazAtoms[0]);
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

	it('too small batch size throws error', async () => {
		throw 'todo'
	})

	it('big enough batch saves once', async () => {
		x = fac();

		const store = new FakeStore(new MonoidData(), 6);

		await Promise.all([
			x.run.boot('mm', ['gerbil', ['spawn', [0, 2]]]),
			x.run.boot('aa', ['gerbil', ['spawn', [0, 2]]]),
		]);

		const heads = await x.run.machine$
			.pipe(
				map(m => m.head),
				bufferTime(200),
				first(),
				finalize(() => x.run.complete()),
			).toPromise();

		await x.saver.save(store, Set(heads))
		log(store.saved);

		expect(store.batches).toHaveLength(1)
	})

	it('big enough batch, heads resolve to same atom', async () => {
		x = fac();

		const store = new FakeStore(new MonoidData(), 6);

		await Promise.all([
			x.run.boot('mm', ['gerbil', ['spawn', [0, 5]]]),
		]);

		const heads = await x.run.machine$
			.pipe(
				map(m => m.head),
				bufferTime(200),
				first(),
				finalize(() => x.run.complete()),
			).toPromise();

		await x.saver.save(store, Set(heads))

		const atoms = Set(heads)
			.flatMap(h => h.refs())
			.flatMap(r => r.resolve())
			.map(a => a.val.toObject())
		  .toArray();

		expect(atoms).toHaveLength(1);
	})

	it('big enough batch, atom weights consolidated', async () => {
		x = fac();

		const store = new FakeStore(new MonoidData(), 6);

		await Promise.all([
			x.run.boot('mm', ['gerbil', ['spawn', [0, 2]]]),
			x.run.boot('aa', ['gerbil', ['spawn', [0, 2]]]),
		]);

		const heads = await x.run.machine$
			.pipe(
				map(m => m.head),
				bufferTime(200),
				first(),
				finalize(() => x.run.complete()),
			).toPromise();

		await x.saver.save(store, Set(heads))

		const atomWeights = Set(heads)
			.flatMap(h => h.refs())
			.flatMap(r => r.resolve())
			.map(a => a.weight)
		  .toArray();

		expect(atomWeights).toBe([3, 3]);
	})

	it('further saving', async () => {
		x = fac();

		//TODO
		//it breaks when we save in batches over three (wrong weighting)
		//also a batch of 6 should give us one single atom...

		const store = new FakeStore(new MonoidData(), 2);

		await Promise.all([
			x.run.boot('mm', ['gerbil', ['spawn', [0, 2]]]),
			x.run.boot('aa', ['gerbil', ['spawn', [0, 2]]]),
		]);

		//TODO
		//when batch size is not big enough...
		//gets stuck in endless loop

		//TODO
		//ordering of savables


		// log(1)
		const gatheringHeads = gather(x.run.machine$
			.pipe(map(m => m.head)))

		await delay(200);
		
		x.run.complete();
		// log(2)

		const heads = await gatheringHeads;

		//all atoms will then have a weight (zero means not pending)
		//this weight would be both local and total/projected
		//though we have a messy late-addition method on the atom I believe
		//
		
		await x.saver.save(store, Set(heads))
		// log(store.saved)
	})

	it('flump', () => {
		let set = OrderedSet();
		set = set.add(1)
		set = set.add(2)
		set = set.add(1)

		log(set)
	})
})

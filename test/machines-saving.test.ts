import _Monoid from '../src/_Monoid'
import { scenario, getAtoms } from './shared'
import { rodents } from './worlds/rodents'
import FakeStore from './FakeStore';
import MonoidData from '../src/MonoidData';
import { Map, Set, List } from 'immutable'
import { map, bufferTime, finalize, first } from 'rxjs/operators';
import { delay } from '../src/util';
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
		x = fac({ batchSize: 2 });

		await x.run.boot('aa', ['gerbil', ['spawn', [0, 4]]]);

		await delay(400);
		x.run.complete();

		expect([...List(x.store.batches)
			.flatMap(b => b.valueSeq())
			.map(a => a[0])])
			.not.toContain('$boot')
	})

	xit('too small batch size throws error', async () => {
		x = fac({ batchSize: 1 });

		await Promise.all([
			x.run.boot('mm', ['gerbil', ['spawn', [0, 2]]]),
			x.run.boot('aa', ['gerbil', ['spawn', [0, 2]]]),
		]);

		await delay(400);
		x.run.complete();

		throw 'TODO where will error appear?'
	})

	it('big enough batch saves once', async () => {
		x = fac({ batchSize: 6, threshold: 6 });

		await Promise.all([
			x.run.boot('mm', ['gerbil', ['spawn', [0, 2]]]),
			x.run.boot('aa', ['gerbil', ['spawn', [0, 2]]]),
		]);

		await delay(300);
		x.run.complete();
		await delay(200);

		expect(x.store.batches).toHaveLength(1)
	})
	
	it('big enough batch, heads resolve to same atom', async () => {
		x = fac({ batchSize: 6, threshold: 6 });

		await Promise.all([
			x.run.boot('mm', ['gerbil', ['spawn', [0, 5]]]),
		]);

		await delay(200);

		const {heads} = await x.run.atoms.state$
			.pipe(first()).toPromise();

		x.run.complete();
		await delay(200);

		const atoms = Set(heads)
			.flatMap(h => h.refs())
			.flatMap(r => r.resolve())
			.toArray();

		expect(atoms).toHaveLength(1);

		expect(Map(atoms[0].val).keySeq().toSet())
			.toStrictEqual(Set(['mm', 'mn', 'mo', 'mp', 'mq', 'mr']));

		expect(atoms[0]).toHaveProperty('weight', 6);
	})

	it('further saving', async () => {
		x = fac({ batchSize: 5, threshold: 4 });

		await Promise.all([
			x.run.boot('mm', ['gerbil', ['spawn', [0, 2]]]),
			x.run.boot('aa', ['gerbil', ['spawn', [0, 2]]]),
		]);

		//TODO
		//ordering of savables

		await delay(500);
		
		x.run.complete();
	})
})

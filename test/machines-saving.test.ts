import _Monoid from '../src/_Monoid'
import { scenario } from './shared'
import { rodents } from './worlds/rodents'
import { Map, Set, List } from 'immutable'
import { first } from 'rxjs/operators';
import { delay } from '../src/util';
const log = console.log;

describe('machines - saving', () => {
	const fac = scenario(rodents());
	let x: ReturnType<typeof fac>

	it('atoms conjoin without consolidation (no saver or rewrites)', async () => {
		x = fac({ runSaver: false });

		await Promise.all([
			x.run.boot('baz', ['guineaPig', ['runAbout', []]]),
			x.run.boot('loz', ['guineaPig', ['gruntAt', ['baz']]])
		]);
		
		await delay(100);
		x.run.complete();

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
			x.run.boot('loz', ['guineaPig', ['gruntAt', ['baz']]])
		]);

		await delay(100)
		x.run.complete(); //should be self-closing really

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

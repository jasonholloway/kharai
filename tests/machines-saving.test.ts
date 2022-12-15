import _Monoid from '../src/_Monoid'
import { testRun, showData } from './shared'
import { rodents } from './worlds/rodents'
import { Map, Set, List } from 'immutable'
import { World } from '../src/shape/World'
import { act } from '../src/shape/common'
import { Num } from '../src/guards/Guard'

describe('machines - saving', () => {

	const world = rodents.build();

	it('atoms conjoin without consolidation (no saver or rewrites)', async () => {
		const x = testRun(world, { save: false });

		await Promise.all([
			x.run.boot('baz', ['M_guineaPig_runAbout']),
			x.run.boot('loz', ['M_guineaPig_gruntAt', 'baz']),
			x.run.log$.toPromise()
		]);

		const baz = x.view('baz');
		const loz = x.view('loz');

		expect(baz.map(showData))
			.toEqual([
				{
					baz: ['M_guineaPig_runAbout']
				},
				{
					baz: ['*_end', 'grunt!'],
					loz: ['*_end', 'squeak!']
				}
			]);

		expect(baz[0].parents()).toHaveLength(0);
		expect(baz[1].parents()).toContainEqual(baz[0]);
		expect(baz[1].parents()).toContainEqual(loz[0]);

		expect(loz.map(showData))
			.toEqual([
				{
					loz: ['M_guineaPig_gruntAt', 'baz']
				},
				{
					baz: ['*_end', 'grunt!'],
					loz: ['*_end', 'squeak!']
				}
			]);

		expect(loz[0].parents()).toHaveLength(0);
		expect(loz[1].parents()).toContainEqual(loz[0]);
		expect(loz[1].parents()).toContainEqual(baz[0]);
	})

	it('atoms consolidated (via saver)', async () => {
		const x = testRun(world);

		await Promise.all([
			x.run.boot('baz', ['M_guineaPig_runAbout']),
			x.run.boot('loz', ['M_guineaPig_gruntAt', 'baz']),
			x.run.log$.toPromise()
		]);

		const baz = x.view('baz');
		const loz = x.view('loz');

		expect(baz).toHaveLength(1);
		expect(showData(baz[0])).toEqual({
			baz: ['*_end', 'grunt!'],
			loz: ['*_end', 'squeak!']
		});
		expect(baz[0].parents()).toHaveLength(0);

		expect(loz).toHaveLength(1);
		expect(showData(loz[0])).toEqual({
			baz: ['*_end', 'grunt!'],
			loz: ['*_end', 'squeak!']
		});
		expect(loz[0].parents()).toHaveLength(0);
	})

	it('doesn\'t save $boots', async () => {
		const x = testRun(world, { maxBatchSize:2 });

		await Promise.all([
			x.run.boot('a', ['M_gerbil_spawn', [0, 2]]),
			x.run.log$.toPromise()
		]);

		expect([...List(x.store.batches)
			.flatMap(b => b.valueSeq())
			.map(v => <[string]>v)
			.map(([p]) => p)])
			.not.toContain('*_boot')
	})

	xit('too small batch size throws error', async () => {
		const x = testRun(world, { maxBatchSize:1 });

		await Promise.all([
			x.run.boot('m', ['M_gerbil_spawn', [0, 2]]),
			x.run.boot('a', ['M_gerbil_spawn', [0, 2]]),
			x.run.log$.toPromise()
		]);

		throw 'TODO where will error appear?'
	})

	it('big enough batch saves once', async () => {
		const x = testRun(world, { maxBatchSize:24, threshold:10 });

		await Promise.all([
			x.run.boot('m', ['M_gerbil_spawn', [0, 2]]),
			x.run.boot('a', ['M_gerbil_spawn', [0, 2]]),
			x.run.log$.toPromise()
		]);

		expect(x.store.saved.get('a')).toEqual(['M_gerbil_spawn', [2, 2]]);
		expect(x.store.saved.get('m')).toEqual(['M_gerbil_spawn', [2, 2]]);
		expect(x.store.saved.get('aa')).toEqual(['M_gerbil_spawn', [0, 2]]);
		expect(x.store.saved.get('ma')).toEqual(['M_gerbil_spawn', [0, 2]]);
		expect(x.store.saved.get('ab')).toEqual(['M_gerbil_spawn', [0, 2]]);
		expect(x.store.saved.get('mb')).toEqual(['M_gerbil_spawn', [0, 2]]);

		expect(x.store.batches).toHaveLength(1)

	})
	
	it('big enough batch, heads resolve to same atom', async () => {
		const x = testRun(world, { maxBatchSize:24, threshold:5 });

		await Promise.all([
			x.run.boot('a', ['M_gerbil_spawn', [0, 2]]),
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

		expect(atom).toHaveProperty('weight', 5);
	})

	xit('further saving', async () => {
		const x = testRun(world, { maxBatchSize:5, threshold:4 });

		await Promise.all([
			x.run.boot('m', ['M_gerbil_spawn', [0, 2]]),
			x.run.boot('a', ['M_gerbil_spawn', [0, 2]]),
			x.run.log$.toPromise()
		]);

		//TODO
		//ordering of savables
	})

	it.each([[1],[2],[10]])
		('saves all cleanly at end %i', async c => {
			const w = World
				.shape({
					blah: act(Num)
				})
				.impl({
					async blah({and}, i) {
						return i < c && and.blah(i + 1);
					}
				})
				.build();

			const x = testRun(w, { maxBatchSize:5, threshold:5 });

			await Promise.all([
				x.run.boot('a', ['M_blah', 0]),
				x.run.log$.toPromise()
			]);

			//the thing to do here
			//is to save on close
			//but how do we know we've closed?
			//the logs have closed, so the overall must have closed
			//
			//seems legit actually - as soon as there is no machine running, we are dead
			//if we want to continue running, we need a sleeper keeping everything going
			//
			//and when the log is dead, then the overall is dead, I suppose
			//the end of the log is the sign that the MachineSpace has stopped
			//
			//so - when the log completes, the run should close the saver, which will trigger
			//the final save(s)

			expect(x.store.saved.get('a')).toEqual(['M_blah', c]);
		})
})


import { describe, expect, it, xit } from '@jest/globals';
import _Monoid from '../src/_Monoid'
import { run, showData } from './shared'
import { rodents } from './worlds/rodents'
import { Map, Set, List } from 'immutable'
import { World } from '../src/shape/World'
import { act } from '../src/shape/common'
import { Num } from '../src/guards/Guard'
import { delay } from './helpers'

describe('machines - saving', () => {

	const world = rodents.build();

	it('atoms conjoin without consolidation (no saver or rewrites)', () =>
		run(world, {save:false})
			.perform(({boot,and}) => boot('baz', and.guineaPig.runAbout()))
			.perform(({boot,and}) => boot('loz', and.guineaPig.gruntAt('baz')))
			.waitQuiet()
			.then(({view}) => {
				const baz = view('baz').atoms;
				const loz = view('loz').atoms;

				expect(baz.map(showData))
					.toEqual([
						{
							baz: ['M_guineaPig_runAbout'],
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
		)

	it('atoms consolidated (via saver)', () =>
		run(world)
			.perform(x => Promise.all([
				x.boot('baz', x.and.guineaPig.runAbout()),
				x.boot('loz', x.and.guineaPig.gruntAt('baz'))
			]))
			.waitQuiet()
			.then(({view}) => {
				const baz = view('baz').atoms;
				const loz = view('loz').atoms;

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
		)

	it('doesn\'t save $boots', () =>
		run(world, {maxBatchSize:2})
			.perform(({and,boot}) =>
				boot('a', and.gerbil.spawn([0,2])))
			.waitQuiet()
			.then(({batches}) => {
				expect([...List(batches)
					.flatMap(b => b.valueSeq())
					.map(v => <[string]>v)
					.map(([p]) => p)])
					.not.toContain('*_boot')
			})
		)

	xit('too small batch size throws error', () =>
		run(world, {maxBatchSize:1})
			.perform(({boot,and}) => Promise.all([
				boot('m', and.gerbil.spawn([0,2])),
				boot('a', and.gerbil.spawn([0,2]))
			]))
			.waitQuiet()
			.then(s => {
				throw 'TODO where will error appear?'
			}))

	it('big enough batch saves once', () =>
		run(world, {maxBatchSize:24, threshold:10})
			.perform(({boot,and}) => Promise.all([
				boot('m', and.gerbil.spawn([0, 2])),
				boot('a', and.gerbil.spawn([0, 2]))
			]))
			.waitQuiet()
			.then(s => {
				expect(s.saved.get('a')).toEqual(['M_gerbil_spawn', [2, 2]]);
				expect(s.saved.get('m')).toEqual(['M_gerbil_spawn', [2, 2]]);
				expect(s.saved.get('aa')).toEqual(['M_gerbil_spawn', [0, 2]]);
				expect(s.saved.get('ma')).toEqual(['M_gerbil_spawn', [0, 2]]);
				expect(s.saved.get('ab')).toEqual(['M_gerbil_spawn', [0, 2]]);
				expect(s.saved.get('mb')).toEqual(['M_gerbil_spawn', [0, 2]]);

				expect(s.batches).toHaveLength(1)
			}))
	
	it('big enough batch, heads resolve to same atom', () =>
		run(world, {maxBatchSize:24, threshold:5})
			.perform(({and,boot}) => Promise.all([
				boot('a', and.gerbil.spawn([0,2]))
			]))
			.waitQuiet()
			.then(({view}) => {
				const [a] = view('a').atoms;
				const [aa] = view('aa').atoms;
				const [ab] = view('ab').atoms;

				const atoms = Set([a, aa, ab])
					.map(v => v.unpack());

				expect(atoms.toArray()).toHaveLength(1);

				const [atom] = atoms;

				expect(Map(atom.val).keySeq().toSet())
					.toStrictEqual(Set(['a', 'aa', 'ab']));

				expect(atom).toHaveProperty('weight', 5);
			}))

	xit('further saving', () =>
		run(world, {maxBatchSize:5, threshold:4 })
			.perform(({and,boot}) => Promise.all([
				boot('m', and.gerbil.spawn([0,2])),
				boot('a', and.gerbil.spawn([0,2]))
			]))
			.waitQuiet()
			.then(s => {
				//TODO
				//ordering of savables
			}))

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

			await run(w, { maxBatchSize:5, threshold:5 })
			  .perform(({and,boot}) => boot('a', and.blah(0)))
				.waitQuiet()
				.then(({saved}) => {
					expect(saved.get('a')).toEqual(['M_blah', c]);
				})


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

		})
})


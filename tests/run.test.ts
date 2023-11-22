import { describe, expect, it, xit } from '@jest/globals';
import { Map } from 'immutable'
import { rodents } from "./worlds/rodents";
import { delay } from '../src/util';
import { run } from './shared'
import { World } from '../src/shape/World';
import { act, incl, root } from '../src/shape/common';
import { Str, Num } from '../src/guards/Guard'

describe('running', () => {
	const world = rodents.build();

	it('start and stop', () =>
		run(world)
			.perform(({and,boot}) => Promise.all([
				boot('a', and.gerbil.spawn([0,3])),
				boot('b', and.gerbil.spawn([0,2]))
			]))
			.waitQuiet()
		);

	it('starting fresh', () =>
		run(world)
			.perform(({and,boot}) =>
				boot('fresh', and.guineaPig.runAbout()))
			.waitQuiet()
			.then(({result}) => {
				expect(result).toBeTruthy();
			})
		);

	it('can summon by name', () => {
		const w = World
			.shape({
				rat: act(),
				mouse: act(Num)
			})
		  .impl({
				async rat({and,convene}) {
					await convene(['@M_mouse,123'], async ps => {
						return ps.first()?.chat('squeak');
					});

					return and.end('dunrattin');
				},

				mouse({and,attend}, n) {
					return attend(m => [m])
					  .then(r => and.end(`${n} ${r}`))
					  .else(false);
				}
			});

		return run(w.build())
		  .perform(({and,boot}) => Promise.all([
				boot('R', and.rat())
			]))
			.waitQuiet()
			.then(({logs}) => {
				expect(logs).toEqual([
					['R', ['*_boot']],
					['R', ['M_rat']],
					['@M_mouse,123', ['M_mouse', '123']],
					['R', ['*_end', 'dunrattin']],
					['@M_mouse,123', ['*_end', '123 squeak']],
				]);
			})
	})

	it('can refer by name, using helper', () => {
		const w = World
			.shape({
				rat: act(),
				mouse: root(Str)
			})
		  .impl({
				async rat({and,convene,ref}) {
					await convene([ref.mouse('123')], async ps => {
						return ps.first()?.chat('squeak');
					});

					return and.end('dunrattin');
				},

				mouse({and,attend}, n) {
					return attend(m => [m])
					  .then(r => and.end(`${n} ${r}`))
					  .else(false);
				}
			});

		return run(w.build())
			.perform(({and,boot}) => Promise.all([
				boot('R', and.rat())
			]))
			.waitQuiet()
		  .then(({logs}) => {
				expect(logs).toEqual([
					['R', ['*_boot']],
					['R', ['M_rat']],
					['@M_mouse,123', ['M_mouse', '123']],
					['R', ['*_end', 'dunrattin']],
					['@M_mouse,123', ['*_end', '123 squeak']],
				]);
			})
	})

	it('can refer by name, from template', async () => {
		const beasties = World
			.shape({
				rat: act(),
				mouse: root(Str)
			})
		  .impl({
				async rat({and,convene,ref}) {
					await convene([ref.mouse('123')], async ps => {
						return ps.first()?.chat('squeak');
					});

					return and.end('dunrattin');
				},

				mouse({and,attend}, n) {
					return attend(m => [m])
					  .then(r => and.end(`${n} ${r}`))
					  .else(false);
				}
			});

		const w = World
		  .shape({
				beasties: incl(beasties)
			});

		await run(w.build())
			.perform(({and,boot}) => Promise.all([
				boot('R', and.beasties.rat())
			]))
			.waitQuiet()
			.then(({logs}) => {
				expect(logs).toEqual([
					['R', ['*_boot']],
					['R', ['M_beasties_rat']],
					['@M_beasties_mouse,123', ['M_beasties_mouse', '123']],
					['R', ['*_end', 'dunrattin']],
					['@M_beasties_mouse,123', ['*_end', '123 squeak']],
				]);
			})
	})

	xit('refs can convene', () => {})

	//refs should be handles, with possible operations available
	//
	//
	
	

	//TODO
	//below requires boot() to be ''preemptable'
	//or rather - it can't just opaquely summon and run
	//summoning should be separate and awaitable
	//while convening, as a separate step, should be preemptable
	xit('starting existing', async () => {
		const w = World
		  .shape({
				pootle: act(),
				blah: act()
			})
		  .impl({
				async pootle() {
					await delay(1000);
					return false;
				},
				async blah() {
					return false;
				}
			});

		await run(w.build(), {
				data: Map({
					existing: ['pootle']
				})
			})
			.perform(({and,boot}) => Promise.all([
				boot('existing', and.blah())
			]))
			.waitQuiet()
			.then(({result}) => {
				expect(result).toBeFalsy();
			})
	})

	xit('starting both fresh and existing', () =>
		run(world, {
				data: Map({
					existing: ['M_rat_wake']
				})
			})
			.perform(
				({and,boot}) => boot('existing', and.hamster.wake(123)),
				({and,boot}) => boot('fresh', and.hamster.wake(123))
			)
			.waitQuiet()
			.then(({result,view}) => {
				const [bootedExisting, bootedFresh] = result;
				
				expect(bootedExisting).toBeFalsy();
				expect(bootedFresh).toBeTruthy();

				const existing = view('existing');
				expect(existing).toEqual([
					['M_rat_wake'],
					['M_rat_squeak', 123],
					['*_end', 'I have squeaked 123!']
				]);

				const fresh = view('fresh');
				expect(fresh).toEqual([
					['*_boot'],
					['M_hamster_wake', 123],
					['*_end', 123]
				]);
			})
		 );

	xit('graceful ending of deadlocks', async () => {
		//
		//deadlocks get in the way of graceful shutdown
		//and should be detectable in many cases
		//
		//if all the peers a convener is waiting for have finnished
		//(or are waiting for other peers that are impossible) 
		//then we can give up, just throw an exception
		//
		//but attaching deadlocks too - attaching can be cancelled if
		//there are no machines that can possibly convene
		//(ie all existing are attaching)
		//
		//TODO
	})
	
})

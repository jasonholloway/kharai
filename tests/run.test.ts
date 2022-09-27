import { Map } from 'immutable'
import { rodents } from "./worlds/rodents";
import { delay } from '../src/util';
import { createRunner } from './shared'
import { World } from '../src/shape/World';
import { act, incl } from '../src/shape/common';
import { Str, Num } from '../src/guards/Guard'
import { inspect } from 'node:util';

describe('running', () => {
	const world = rodents.build();

	it('start and stop', async () => {
		const x = createRunner(world);

		await Promise.all([
			x.run.boot('a', ['gerbil_spawn', [0, 3]]),
			x.run.boot('b', ['gerbil_spawn', [0, 2]]),
		]);
		
		await x.run.log$.toPromise();
		await x.run.machine$.toPromise();
	})

	it('starting fresh', async () => {
		const x = createRunner(world);

		const success = await x.run.boot('fresh', ['guineaPig_runAbout']);
		expect(success).toBeTruthy();
	})

	it('can summon by name', async () => {
		const w = World
			.shape({
				rat: act(),
				mouse: act(Num)
			})
		  .impl({
				async rat({and,convene}) {
					await convene(['@mouse,123'], ps => {
						return ps.first()?.chat('squeak');
					});

					return and.end('dunrattin');
				},

				async mouse({and,attend}, n) {
					const r = await attend(m => [m]);
					return r && and.end(`${n} ${r[0]}`);
				}
			});

		const x = createRunner(w.build());

		const [logs] = await Promise.all([
			x.allLogs(),
			x.run.boot('R', ['rat'])
		]);

		expect(logs).toEqual([
			['R', ['boot']],
			['R', ['rat']],
			['@mouse,123', ['mouse', '123']],
			['R', ['end', 'dunrattin']],
			['@mouse,123', ['end', '123 squeak']],
		]);
	})

	it('can refer by name, using helper', async () => {
		const w = World
			.shape({
				rat: act(),
				mouse: act(Str)
			})
		  .impl({
				async rat({and,convene,ref}) {
					await convene([ref.mouse('123')], ps => {
						return ps.first()?.chat('squeak');
					});

					return and.end('dunrattin');
				},

				async mouse({and,attend}, n) {
					const r = await attend(m => [m]);
					return r && and.end(`${n} ${r[0]}`);
				}
			});

		const x = createRunner(w.build());

		const [logs] = await Promise.all([
			x.allLogs(),
			x.run.boot('R', ['rat'])
		]);

		expect(logs).toEqual([
			['R', ['boot']],
			['R', ['rat']],
			['@mouse,123', ['mouse', '123']],
			['R', ['end', 'dunrattin']],
			['@mouse,123', ['end', '123 squeak']],
		]);
	})

	it('can refer by name, from template', async () => {
		const beasties = World
			.shape({
				rat: act(),
				mouse: act(Str)
			})
		  .impl({
				async rat({and,convene,ref}) {
					await convene([ref.mouse('123')], ps => {
						return ps.first()?.chat('squeak');
					});

					return and.end('dunrattin');
				},

				async mouse({and,attend}, n) {
					const r = await attend(m => [m]);
					return r && and.end(`${n} ${r[0]}`);
				}
			});

		const w = World
		  .shape({
				beasties: incl(beasties)
			});

		const x = createRunner(w.build());

		const [logs] = await Promise.all([
			x.allLogs(),
			x.run.boot('R', ['beasties_rat'])
		]);

		expect(logs).toEqual([
			['R', ['boot']],
			['R', ['beasties_rat']],
			['@beasties_mouse,123', ['beasties_mouse', '123']],
			['R', ['end', 'dunrattin']],
			['@beasties_mouse,123', ['end', '123 squeak']],
		]);
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
		
		const x = createRunner(w.build(), {
			data: Map({
				existing: ['pootle']
			})
		});

		const success = await x.run.boot('existing', ['blah']);
		expect(success).toBeFalsy();
	})

	xit('starting both fresh and existing', async () => {
		const x = createRunner(world,
		{
			data: Map({
				existing: ['rat_wake']
			})
		});

		await x.session(async () => {
			const [bootedExisting, bootedFresh] = await Promise.all([
				x.run.boot('existing', ['hamster_wake', 123]),
				x.run.boot('fresh', ['hamster_wake', 123])
			]); 

			expect(bootedExisting).toBeFalsy();
			expect(bootedFresh).toBeTruthy();

			await delay(300);
		});

		const existing = await x.logs('existing');
		expect(existing).toEqual([
			['rat_wake'],
			['rat_squeak', 123],
			['end', 'I have squeaked 123!']
		]);

		const fresh = await x.logs('fresh');
		expect(fresh).toEqual([
			['boot'],
			['hamster_wake', 123],
			['end', 123]
		]);
	})

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

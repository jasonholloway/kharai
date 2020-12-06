import { Map } from 'immutable'
import { rodents, Rodents } from "./worlds/rodents";
import { newRun } from "../src/Run";
import { Phase, Id } from "../src/lib";
import { Loader } from './MachineSpace';
import { scenario } from './shared';
import { delay } from '../src//util';
const log = console.log;

describe('running', () => {
	type P = Phase<Rodents>;

	it('start and stop', async () => {
		const world = rodents();

    const loader: Loader<P> =
      ids => Promise.resolve(
				ids.reduce<Map<Id, P>>(
					(ac, id) => ac.set(id, ['$boot', []]),
					Map()));

		const run = newRun(world, loader);

		await Promise.all([
			run.boot('a', ['gerbil', ['spawn', [0, 3]]]),
			run.boot('b', ['gerbil', ['spawn', [0, 2]]]),
		]);
		
		await run.log$.toPromise();
		await run.machine$.toPromise();
	})

	it('starting fresh', async () => {
		const x = scenario(rodents())(
			{
				loader: ids => Promise.resolve(
					ids.reduce<Map<Id, P>>(
						(ac, id) => ac.set(id, ['$boot', []]),
						Map()))
			});

		const success = await x.run.boot('fresh', ['guineaPig', ['runAbout', []]]);
		expect(success).toBeTruthy();
	})

	it('starting existing', async () => {
		const x = scenario(rodents())(
			{
				loader: ids => Promise.resolve(
					ids.reduce<Map<Id, P>>(
						(ac, id) => ac.set(id, ['gerbil', ['spawn', [0, 2]]]),
						Map()))
			});

		const success = await x.run.boot('existing', ['guineaPig', ['runAbout', []]]);
		expect(success).toBeFalsy();
	})

	it('starting both fresh and existing', async () => {
		const x = scenario(rodents())(
			{
				loader: ids => Promise.resolve(
					ids.reduce<Map<Id, P>>(
						(ac, id) => {
							switch(id) {
								case 'existing': return ac.set(id, ['rat', ['wake', []]]);
								default: return ac.set(id, ['$boot', []]);
							}
						},
						Map()))
			});

		await x.session(async () => {
			const [bootedExisting, bootedFresh] = await Promise.all([
				x.run.boot('existing', ['hamster', ['wake', [123]]]),
				x.run.boot('fresh', ['hamster', ['wake', [123]]])
			]); 

			expect(bootedExisting).toBeFalsy();
			expect(bootedFresh).toBeTruthy();

			await delay(300);
		});

		const existing = await x.logs('existing');
		expect(existing).toEqual([
			['rat', ['wake', []]],
			['rat', ['squeak', [123]]],
			['$end', ['I have squeaked 123!']]
		]);

		const fresh = await x.logs('fresh');
		expect(fresh).toEqual([
			['$boot', []],
			['hamster', ['wake', [123]]],
			['$end', [123]]
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


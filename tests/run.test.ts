import { Map } from 'immutable'
import { rodents } from "../src/worlds/rodents";
import { delay } from '../src/util';
import { createRunner } from './shared'

describe('running', () => {
	const world = rodents.build();

	it('start and stop', async () => {
		const x = createRunner(world);

		await Promise.all([
			x.run.boot('a', ['gerbil', ['spawn', [0, 3]]]),
			x.run.boot('b', ['gerbil', ['spawn', [0, 2]]]),
		]);
		
		await x.run.log$.toPromise();
		await x.run.machine$.toPromise();
	})

	it('starting fresh', async () => {
		const x = createRunner(world);

		const success = await x.run.boot('fresh', ['guineaPig', ['runAbout', []]]);
		expect(success).toBeTruthy();
	})

	//TODO loaded states should be frisked at runtime

	it('starting existing', async () => {
		const x = createRunner(world, {
			loader: ids => Promise.resolve(
				ids.reduce(
					(ac, id) => ac.set(id, ['gerbil', ['spawn', [0, 2]]]),
					Map()))
		});

		const success = await x.run.boot('existing', ['guineaPig', ['runAbout', []]]);
		expect(success).toBeFalsy();
	})

	it('starting both fresh and existing', async () => {
		const x = createRunner(world,
		{
			loader: ids => Promise.resolve(
				ids.reduce(
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

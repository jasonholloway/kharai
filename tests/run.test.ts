import { Map } from 'immutable'
import { rodents, Rodents } from "./worlds/rodents";
import { newRun } from "../src/Run";
import { Phase, Id } from "../src/lib";
import { Loader } from './MachineSpace';
import { scenario } from './shared';
const log = console.log;

describe('running', () => {

	it('start and stop', async () => {
		const world = rodents();
		type P = Phase<Rodents>;

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

	it('starting from an existing state', async () => {
		type P = Phase<Rodents>;

		const x = scenario(rodents())(
			{
				loader: ids => Promise.resolve(
					ids.reduce<Map<Id, P>>(
						(ac, id) => ac.set(id, ['gerbil', ['spawn', [0, 2]]]),
						Map()))
			});

		const success = await x.run.tryBoot(['a'], ['guineaPig', ['runAbout', []]]);
		expect(success).toBeFalsy();

		await x.run.log$.toPromise();

		const a = x.view('a');

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


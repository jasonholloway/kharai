import { Map } from 'immutable'
import { rodents, Rodents } from "./worlds/rodents";
import { Run } from "../src/Run";
import { Phase, MachineContext, Id } from "../src/lib";
import { Loader } from './MachineSpace';
const log = console.log;

describe('running', () => {

	it('start and stop', async () => {
		const world = rodents();

    const loader: Loader<Phase<Rodents>> =
      ids => Promise.resolve(
				ids.reduce<Map<Id, Phase<Rodents>>>(
					(ac, id) => ac.set(id, ['$boot', []]),
					Map()));

    const run = new Run<Rodents, MachineContext>(world, loader);

		await Promise.all([
			run.boot('a', ['gerbil', ['spawn', [0, 3]]]),
			run.boot('b', ['gerbil', ['spawn', [0, 2]]]),
		]);
		
		await run.log$.toPromise();
		await run.machine$.toPromise();
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


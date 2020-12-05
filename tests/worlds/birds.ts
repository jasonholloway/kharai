import _Monoid from '../../src/_Monoid'
import { Id, SpecWorld, makeWorld, World, Phase } from '../../src/lib'
import { toArray, take, map, tap } from 'rxjs/operators'
import { delay } from '../../src/util'
import { bootPhase, endPhase, waitPhase } from '../../src/phases'

const log = console.log;

export type TBirds<Me extends World = World> = SpecWorld<{
	$boot: []
	$end: [any[]]
	$wait: [number, Phase<Me>]
	// $watch: [Id, string, Phase<Me>]

	track: [Id[], number]
	runAround: [number]
	// sleepThen: [number, Phase<Me>]
}>

export type Birds = TBirds<TBirds>

export const birds = makeWorld<Birds>()(
	{
		contextFac: x => x
	},
	{
		phases: {
			$boot: bootPhase(),
			$end: endPhase(),
			$wait: waitPhase(),

			track: x => ({
				guard(d): d is [Id[], number] { return true },
				async run([ids, c]) {
					const frames = await x.watch(ids)
						.pipe(take(c), toArray())
						.toPromise();

					return ['$end', [frames]];
				}
			}),

			runAround: x => ({
				guard(d): d is [number] { return true },
				async run([n]) {
					if(n > 0) {
						await delay(20);
						return ['runAround', [n-1]]
					}
					
					return false;
				}
			}),

			// sleepThen: x => ({
			// 	guard(d): d is [number, Phase<Birds>] { return true },
			// 	async run([timeout, next]) {
			// 		await delay(timeout);
			// 		return next;
			// 	}
			// })
		}
	});

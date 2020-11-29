import _Monoid from '../../src/_Monoid'
import { Id, Data, SpecWorld, makeWorld, World } from '../../src/lib'
import { toArray, take } from 'rxjs/operators'
import { delay } from '../../src/util'
import { bootPhase, endPhase } from '../../src/phases'

export type TBirds<Me extends World = World> = SpecWorld<{
	$boot: []
	$end: [Data[]]
	// $watch: [Id, string, Phase<Me>]

	track: [Id[], number]
	runAround: [number]
	sleep: [number]
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

			sleep: x => ({
				guard(d): d is [number] { return true },
				async run([timeout]) {
					await delay(timeout);
					return ['$end', [[]]]
				}
			})
		}
	});

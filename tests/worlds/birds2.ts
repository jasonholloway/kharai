import _Monoid from '../../src/_Monoid'
import { Id, SpecWorld, makeWorld, World, Phase } from '../../src/lib'
import { toArray, take, map, tap } from 'rxjs/operators'
import { delay } from '../../src/util'
import { bootPhase, endPhase, waitPhase } from '../../src/phases'
import { specify, space, data, SchemaNode, Data, Space, $Root } from '../specs'
import { Str, Num, Many, Read, Any } from '../guards/Guard'

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

const w1 = specify(me =>
	space({
		$boot: data([]),
		// $end: data([Many(Any)] as const),
		// $wait: data([Num, me] as const),

		emu: space({
			track: data([Many(Str), Num] as const),
			runAround: data([Num] as const),
		})
		
	}));


const w2 = w1.withContext('emu', x => ({ moo:123 }));

const w3 = w2.withPhase('emu:runAround', async (x, d) => ['emu:track', [[], 123]]);


w3.read(['emu:track', [[], NaN]])


	
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

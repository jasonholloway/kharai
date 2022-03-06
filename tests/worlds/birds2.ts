import _Monoid from '../../src/_Monoid'
import { Id, SpecWorld, World, Phase } from '../../src/lib'
import { toArray, take } from 'rxjs/operators'
import { delay } from '../../src/util'
import { specify, space, data } from '../specs'
import { Str, Num, Many, Any } from '../guards/Guard'

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
		$end: data([Many(Any)] as const),
		// $wait: data([Num, me] as const),

		emu: space({
			track: data([Many(Str), Num] as const),
			runAround: data([Num] as const),
		})
		
	}));


const w2 = w1.withContext('emu', x => ({ moo:123 }));

const w3 = w2
	.withPhase('emu:runAround', async (x, [n]) => {
		if(n > 0) {
			await delay(20);
			return ['emu:runAround', [n-1]]
		}

		return false;
});

const w4 = w3
	.withPhase('emu:track', async (x, [ids, c]) => {
		const frames = await x.watch(ids)
			.pipe(take(c), toArray())
			.toPromise();

		return ['$end', [frames]];
	});








const Scraper =
	space({
		scrape: data([Num] as const),
		notify: data([Str] as const)
	});

const w = specify(me =>
	space({
		$boot: data([]),
		$end: data([Many(Any)] as const),
		$wait: data([Num, me] as const),

		AO: Scraper,
		Very: Scraper,
		Argos: Scraper
	}));


w.withPhase('AO:scrape', async (x, [n]) => {

	console.log(n + 13);
	
	//do something here...
	await Promise.resolve();

	return ['AO:notify', ['https://someurl']]
})

w.withPhase('AO:notify', async (x, d) => {

	return ['$wait', [1000, ['AO:scrape', [123]]]];
})

w.withPhase('Very:scrape', async (x, d) => {
	//do something here...
	await Promise.resolve();

	return ['$wait', [100000, ['Very:scrape', [123]]]]
})


	

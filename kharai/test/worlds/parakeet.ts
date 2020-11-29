import _Monoid from '../../src/_Monoid'
import { Id, SpecWorld, makeWorld, World } from '../../src/lib'
import { bootPhase, endPhase } from '../../src/phases'

export type TParakeet<Me extends World = World> = SpecWorld<{
	$boot: []
	$end: [any?]

	listen: []
	chirp: [Id[], string]
}>

export type Parakeet = TParakeet<TParakeet>

export const parakeet = makeWorld<Parakeet>()(
	{
		contextFac: x => x
	},
	{
		phases: {
			$boot: bootPhase(),
			$end: endPhase(),

			listen: x => ({
				guard(d): d is [] { return true },
				async run() {
					const r = await x.attach({
						chat([ids, m]) {
							return <[[Id[], string]]>[[ids, m]];
						}
					});

					if(r) {
						const [[ids, m]] = r;
						return ['chirp', [ids, m]]
					}

					return ['$end', []];
				}
			}),

			chirp: x => ({
				guard(d): d is [Id[], string] { return true },
				async run([[id, ...otherIds], message]) {
					if(id) {
						const r = await x.convene([id], {
							convene(peers) {
								peers.forEach(p => p.chat([otherIds, message]));
								return 'chirped!';
							}
						});
						return ['$end', [r]];
					}

					return ['$end', ['no-one to chirp to!']];
				}
			})
		}
	})

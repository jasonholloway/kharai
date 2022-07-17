import _Monoid from '../../src/_Monoid'
import { World } from '../../src/shape/World';
import { act } from '../../src/shape/common';
import { Many, Str } from '../../src/guards/Guard';
import { Id } from '../lib';

export const parakeet = World
  .shape({
		listen: act([]),
		chirp: act([Many(Str), Str] as const)
	})
  .impl({
		async listen(x, d) {
			const r = await x.attend({
				chat([ids, m]) {
					return <[[Id[], string]]>[[ids, m]];
				}
			});

			if(r) {
				const [[ids, m]] = r;
				return ['chirp', [ids, m]]
			}

			return ['$end', true];
		},

		async chirp(x, [ids, message]) {
			const [id, ...otherIds] = ids;

			if(id) {
				const r = await x.convene([id], {
					convene(peers) {
						peers.forEach(p => p.chat([otherIds, message]));
						return 'chirped!';
					}
				});
				return ['$end', r];
			}

			return ['$end', 'no-one to chirp to!'];
		}
	});


// export const _parakeet = makeWorld<Parakeet>()(
// 	{
// 		contextFac: x => x
// 	},
// 	{
// 		phases: {
// 			$boot: bootPhase(),
// 			$end: endPhase(),

// 			listen: x => ({
// 				guard(d): d is [] { return true },
// 				async run() {
// 					const r = await x.attach({
// 						chat([ids, m]) {
// 							return <[[Id[], string]]>[[ids, m]];
// 						}
// 					});

// 					if(r) {
// 						const [[ids, m]] = r;
// 						return ['chirp', [ids, m]]
// 					}

// 					return ['$end', []];
// 				}
// 			}),

// 			chirp: x => ({
// 				guard(d): d is [Id[], string] { return true },
// 				async run([[id, ...otherIds], message]) {
// 					if(id) {
// 						const r = await x.convene([id], {
// 							convene(peers) {
// 								peers.forEach(p => p.chat([otherIds, message]));
// 								return 'chirped!';
// 							}
// 						});
// 						return ['$end', [r]];
// 					}

// 					return ['$end', ['no-one to chirp to!']];
// 				}
// 			})
// 		}
// 	})

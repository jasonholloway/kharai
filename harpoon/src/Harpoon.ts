import { SpecWorld, makeWorld, World, Phase } from '../lib'
import { bootPhase, endPhase, waitPhase } from '../phases'

export type THarpoon<Me extends World = World> = SpecWorld<{
  $boot: []
  $end: [any]
  $wait: [number, Phase<Me>]

	fetcher: {
		download: []
		getCookie: []
	}

	differ: {
		watchFiles: [],
		diffFiles: []
	}
}>

export type Harpoon = THarpoon<THarpoon>

export const harpoon = () => makeWorld<Harpoon>()(
	{
		contextFac: x => ({
			...x,
			blah: 3
		}),
	},
	{
		phases: {

			$boot: bootPhase(),
			$end: endPhase(),
			$wait: waitPhase(),


			fetcher: {
				download: x => ({
					guard(d): d is [] { return true },
					async run() {
						return ['$wait', [123, ['fetcher', ['download', []]]]];
					}
				}),

				getCookie: x => ({
					guard(d): d is [] { return true },
					async run() {
						return ['download', []]
					}
				})
			},


			differ: {
				watchFiles: x => ({
					guard(d): d is [] { return true },
					async run() {
						return ['diffFiles', []]
					}
				}),

				diffFiles: x => ({
					guard(d): d is [] { return true },
					async run() {
						return ['watchFiles', []]
					}
				})
			}
		}
	});

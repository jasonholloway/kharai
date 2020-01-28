import { SpecWorld, makeWorld } from '../../src/lib'

export type World1 = SpecWorld<{
	context: {}
	resumes: {}
	machines: {
		dummy: {
			phases: {
				start: { input: number }
				middle: { input: any }
				end: { input: any }
			}
		}
	}
}>

export const world1 = makeWorld<World1>({
	resumes: {},
	machines: {
		dummy: {
			zero: {
				data: {},
				resume: 'start'
			},
			phases: {
				start: {
					guard(d): d is number { return true; },
					run: async () => 'middle'
				},
				middle: {
					guard(d): d is any { return true },
					run: async () => 'end'
				},
				end: {
					guard(d): d is any { return true; },
					run: async () => false
				}
			}
		}
	}
})

import { buildDispatch } from '../src/dispatch'
import { PhaseMapImpl } from '../src/lib'
import { Num, Str } from './guards/Guard';
import { World } from './shape/World'
import { act } from './shapeShared';

describe('dispatching', () => {

	// Dispatcher creates base context
	// reads from world
	// prepares full context
	// and actually runs the action (should catch errors too)
	//
	// a layer above the dispatcher, bits are emitted on save
	// and then we continue...
	//
	// the dispatcher might be superfluous as an extra layer
	// something orchestrates the call, but hiding half of it in Dispatcher is naff
	
	it('shallow phases', async () => {
		const w = World
			.shape({
				apple: act(Num),
				banana: act(Str)
			})
			.impl({
				async apple() {
					return ['banana', 'hello']
				},
				async banana() {
					return ['apple', 0]
				}
			})
			.build();

		const r = w.read('');
		const x = r.fac({});

		const dispatch = buildDispatch(w);

		const result1 = await dispatch({})(['apple', [12]]);
		expect(result1).toEqual(['banana', ['hello!']]);

		const result2 = await dispatch({})(['banana', ['woo!']]);
		expect(result2).toEqual(['apple', [0]]);
	})

	it('nested phase', async () => {
		type Phases = {
			fruit: {
				pineapple: [number]
			}
		}

		const phases: PhaseMapImpl<any, Phases> = {
			fruit: {
				pineapple: x => ({
					guard(d): d is [number] { return true },
					async run() { return ['fruit', ['pineapple', [666]]] }
				}),
			}
		}

		const dispatch = buildDispatch(phases);

		const result1 = await dispatch({})(['fruit', ['pineapple', [111]]]);
		expect(result1).toEqual(['fruit', ['pineapple', [666]]]);
	})

	it('sibling phases', async () => {
		type Phases = {
			fruit: {
				citrus: {
					lemon: [number],
					orange: [number]
				}
			}
		}

		const phases: PhaseMapImpl<any, Phases> = {
			fruit: {
				citrus: {
					lemon: x => ({
						guard(d): d is [number] { return true },
						async run() { return ['orange', [999]] }
					}),
					orange: x => ({
						guard(d): d is [number] { return true },
						async run() { return ['lemon', [111]] }
					})
				}
			}
		}

		const dispatch = buildDispatch(phases);

		const result1 = await dispatch({})(['fruit', ['citrus', ['lemon', [111]]]]);
		expect(result1).toEqual(['fruit', ['citrus', ['orange', [999]]]]);
	})

	it('root phases from within nest', async () => {
		type Phases = {
			root: [number]
			fruit: {
				berry: {
					raspberry: [number],
				}
			}
		}

		const phases: PhaseMapImpl<any, Phases> = {
			root: x => ({
				guard(d): d is [number] { return true },
				async run() { return ['root', [7]] }
			}),
			
			fruit: {
				berry: {
					raspberry: x => ({
						guard(d): d is [number] { return true },
						async run() { return ['root', [3]] }
					})
				}
			}
		}

		const dispatch = buildDispatch(phases);

		const result1 = await dispatch({})(['fruit', ['berry', ['raspberry', [111]]]]);
		expect(result1).toEqual(['root', [3]]);
	})

	it('phase returning false', async () => {
		type Phases = {
			artichoke: [],
		}

		const phases: PhaseMapImpl<any, Phases> = {
			artichoke: x => ({
				guard(d): d is [] { return true },
				async run() { return false }
			})
		}

		const dispatch = buildDispatch(phases);

		const result1 = await dispatch({})(['artichoke', []]);
		expect(result1).toEqual(false);
	})
})


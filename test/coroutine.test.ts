import { Set, List } from 'immutable'
import { createHandler, join, compile, Handler, localize } from '../src/handler'
import { t, Command, Tail } from '../src/lib'
import { RO } from './util'

describe('coroutines', () => {

	it('joins', () => {
		const h1 = createHandler({
			async woof() {
				return [t('meeow')]
			}
		})

		const h2 = createHandler({
			async meeow() {
				return [t('woof')]
			}
		})

		const joined = join(h1, h2)

		expect(joined).toHaveLength(2)
		expect(joined[0][0]).toBe('woof')
		expect(joined[1][0]).toBe('meeow')
	})

	it('compiles & dispatches', async () => {
		const h = createHandler({
			async woof(n: number) {
				return [t('meeow', n)]
			}
		})

		const dispatch = compile(h)
		const out = await dispatch(['woof', 7])

		expect(out).toEqual([['meeow', 7]])
	})


	it('coroutinizes', async () =>{
		let count = 1;

		const h1 = createHandler({
			async woof() {
				console.log('HEY!')
				return [t('@me', 'meeow')]
			}
		})

		const h2 = createHandler({
			async meeow() {
				return count-- ? [t('@me', 'woof')] : []
			}
		})

		const hh = localize('gaz', join(h1, h2))

		const dispatch = compile(hh)

		const out = await dispatch(['gaz', 'woof'])

		//need to drive it here

		expect(out).toEqual([
			['gaz', 'meeow'],
			['gaz', 'woof'],
			['gaz', 'meeow'],
		])
	})
	
})


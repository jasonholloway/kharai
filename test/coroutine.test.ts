import { Set, List } from 'immutable'
import { createHandler, join, compile, localize } from '../src/handler'
import { t } from '../src/lib'

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

		expect(out).toEqual(Set([['meeow', 7]]))
	})

	it('coroutinizes', async () =>{
		let count = 1;
		
		const h1 = createHandler({
			async woof() {
				return [t('meeow')]
			}
		})

		const h2 = createHandler({
			async meeow() {
				return count-- ? [t('@me', t('woof'))] : []
				// return foooo;
			}
		})

		const hh = localize('gaz', join(h1, h2))

		const dispatch = compile(hh)
		
		hh
		dispatch

		const out = await dispatch(['gaz', ['woof']])

		//need to drive it here

		expect(out).toEqual(List([
			['woof'],
			['meeow'],
			['woof'],
			['meeow'],
		]))
	})
	
})


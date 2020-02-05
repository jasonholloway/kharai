import { Set, List } from 'immutable'
import { createHandler, join, compile, compileCoroutine } from '../src/handler'
import { collect } from '../src/util'

describe('coroutines', () => {

	it('joins', () => {
		const h1 = createHandler({
			async woof() {
				return [['meeow'] as const]
			}
		})

		const h2 = createHandler({
			async meeow() {
				return [['woof'] as const]
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
				return [['meeow', n] as const]
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
				return [['meeow'] as const]
			}
		})

		const h2 = createHandler({
			async meeow() {
				return count-- ? [['woof'] as const] : []
			}
		})

		const dispatch = compileCoroutine(join(h1, h2))

		const out = await collect(dispatch(['woof']))

		expect(out).toEqual(List([
			['woof'],
			['meeow'],
			['woof'],
			['meeow'],
		]))
	})
	
})



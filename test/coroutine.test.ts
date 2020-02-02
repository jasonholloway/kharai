import { Set, List } from 'immutable'
import { createHandler, join, compile, compileCoroutine } from '../src/handler'

describe('coroutines', () => {

	it('joins', () => {
		const h1 = createHandler({
			async woof() {
				return Set([['meeow']])
			}
		})

		const h2 = createHandler({
			async meeow() {
				return Set([['woof']])
			}
		})

		const joined = join([h1, h2])

		expect(joined).toHaveLength(2)
		expect(joined[0][0]).toBe('woof')
		expect(joined[1][0]).toBe('meeow')
	})

	it('compiles & dispatches', async () => {
		const h = createHandler({
			async woof(n: number) {
				return Set([['meeow', n]])
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
				return Set([['meeow']])
			}
		})

		const h2 = createHandler({
			async meeow() {
				return count-- ? Set([['woof']]) : Set<never>()
			}
		})

		const dispatch = compileCoroutine(join([h1, h2]))

		const out = await collect(dispatch(['woof']))

		expect(out).toEqual(List([
			['woof'],
			['meeow'],
			['woof'],
			['meeow'],
		]))
	})
	
})

async function collect<V>(gen: AsyncIterable<V>): Promise<List<V>> {
	const collected: V[] = [];
	for await (let val of gen) collected.push(val);
	return List(collected)
}



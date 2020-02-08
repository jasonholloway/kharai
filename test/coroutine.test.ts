import { createHandler, join, compile, localize } from '../src/handler'
import { Yield, Command } from '../src/lib'
import { Observer, Subject } from 'rxjs'
import { gather } from './helpers'


describe('coroutines', () => {

	it('joins', () => {
		const h1 = createHandler({
			async woof() {
				return [['meeow']]
			}
		})

		const h2 = createHandler({
			async meeow() {
				return [['woof']]
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
				return [['meeow', n]]
			}
		})

		const dispatch = compile(h)
		const out = await dispatch(['woof', 7])

		expect(out).toEqual([['meeow', 7]])
	})


	it('coroutinizes', async () =>{
		const h1 = createHandler({
			async woof(c: number) {
				return [['@me', 'meow', c]]
			}
		})

		const h2 = createHandler({
			async meow(c: number) {
				return c ? [['@me', 'woof', c-1]] : []
			}
		})

		const hh = localize('gaz', join(h1, h2))
		const dispatch = compile(hh)

		const log$ = new Subject<Command>()
		const gathering = gather(log$);

		run(dispatch, log$, ['gaz', 'woof', 1]);
		
		expect(await gathering)
			.toEqual([
				['gaz', 'woof', 1],
				['gaz', 'meow', 1],
				['gaz', 'woof', 0],
				['gaz', 'meow', 0],
			])
	})
	
})


function run(fn: (c: Command) => Yield, sink: Observer<Command>, c: Command) {
	sink.next(c);
	fn(c).then(out => {
		if(out.length) {
			out.forEach(o => run(fn, sink, o))
		}
		else {
			sink.complete();
		}
	})
	.catch(sink.error);
}


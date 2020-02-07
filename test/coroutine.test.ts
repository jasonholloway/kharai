import { Set, List } from 'immutable'
import { createHandler, join, compile, Handler } from '../src/handler'
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


function localize<
	I extends Command,
	O extends Command,
	Id extends string>
		(id: Id, handler: Handler<I, RO<['@me',I]>|(O[0] extends '@me' ? never : O)>): Handler<readonly [Id,I], readonly [Id,I]|O> {

			//current thinking is, each localisation does need to compile
			//but it won't compile a coroutine exactly: just inputs and outputs
			//the trampoline will still be central: there will be one single driver
			//redispatching everything that's emitted

			//['machine123', ['delay', 123, ['go', 'blah']]]
			//anything emitted as '@me' is saved
			//
			//but - this makes it conceivable that communication can be made into a machine from below; which seems very wrong as it will then break the continuous state
			//each machine is its own space, communicating via tunnels
			//
			//but also communicating outwardly to other shared services
			//the thought of yielding to be driven from below is nice
			//
			//but there has to be some constraint on the driving if everything is sequential within the world of the machine (which it has to be)
			//
			//so, a machine will yield downwards, which will be redispatched to itself; in handling this, the machine will enqueue and on dispatch save the command (doubtful again)
			//
			//as a machine is loaded, its first command must be driven, logged to screen as normal
			//so saving to state must happen before the dispatch
			//
			//unless state passed as part of the message... then there can only be one thread, as it passes with the message
			//there is then a single string saved, with state as well as resumption - state as part of the resumption
			//
			//after the dispatch, a new command is output and saved. it will be saveable because of something distinguishable about its form
			//
			//and if it emits an attempt to save too, this saving will be picked up by another handler, that will save it to the proper head
			//and so running machines can be kept very separate from saving them
			//
			//so... how does this add up? the localized dispatcher just plugs into the total set of handlers, is stateless
			//any commands prefixed with '@' get readdressed to the machine in particular
			//
			//so some kind of compilation is needed before plugging into the driving trampoline
			//


		return <any>handler.map(([k, fn]) => [
				[id, k],
				async (...r: Tail<I>) => {
					const res = await fn(...r)
					return res.map(c => {
						switch(c[0]) {
							case '@me': return [id, c[1]];
							default: return c;
						}
					});
				}
			]
		})

	}

		// if a handler outputs @mes, then these aren't emitted
		// in their place ['bazza', ['summat', 123]]


	it('coroutinizes', async () =>{
		let count = 1;

		const h1 = createHandler({
			async woof() {
				return [t('meeow')]
			}
		})

		const h2 = createHandler({
			async meeow() {
				return count-- ? [t('@me', ['woof'] as const)] : []
			}
		})

		const hh = localize('gaz', join(h1, h2))

		const dispatch = compile(hh)

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


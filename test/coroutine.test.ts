import { createHandler, join, compile, localize, drive } from '../src/handler'
import { Yield, Command } from '../src/lib'
import { Observer, Subject } from 'rxjs'
import { gather, delay } from './helpers'


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


	it('trampolines', async () =>{
		const h1 = createHandler({
			async woof(c: number) {
				return [['@me', 'meow', c]]
			}
		})

		const h2 = createHandler({
			async meow(c: number) {
				return c ? [['@me', 'woof', c-1], ['oink', 'wot']] : []
			}
		})

		const hh = localize('gaz', join(h1, h2))

		const h3 = createHandler({
			async oink(s: string) {
				return [];
			}
		})
		
		const dispatch = compile(join(hh, h3))

		const log$ = new Subject<Command>()
		const gathering = gather(log$);

		drive(dispatch, log$, ['gaz', 'woof', 1]);

		await delay(100);
		log$.complete();
		
		expect(await gathering)
			.toEqual([
				['gaz', 'woof', 1],
				['gaz', 'meow', 1],
				['gaz', 'woof', 0],
				['oink', 'wot'],
				['gaz', 'meow', 0],
			])
	})
})


//summoning a machine gets its stream of logs, that we might or might not wnat to read
//but - what would be the point in getting such a handle, if we can't do anything with it,
//and the only reasonable reader is centralized?
//
//when communicating with another, we firstly want to summon it, and then interact with it
//in the case of message passing, we want to blockinglly wait for it to receive a message from us
//
//------------------
//
//here we're back at the thought of having handlers hardcoded as resources: we would summon a machine context
//and pass it bits and bobs; the actual path of execution would though be done by the dispatcher, and the handlers which would
//use shared resources such as the MachineSpace
//




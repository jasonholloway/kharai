import { Map } from 'immutable'
import { createHandler, compile, Handler, join } from '../src/handler'
import { Id, cmd, Cmd, World, WorldImpl, Yield, Machine, PhaseKey, MachineState, MachineImpl, Keys } from '../src/lib'

describe('coroutines', () => {

	it('joins', () => {
		const h1 = createHandler({
			async woof() {
				return [cmd('meeow', {})]
			}
		})

		const h2 = createHandler({
			async meeow() {
				return [cmd('woof', {})]
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
				return [cmd('meeow', n)]
			}
		})

		const dispatch = compile(h)
		const out = await dispatch(cmd('woof', 7))

		expect(out).toEqual([['meeow', 7]])
	})



	it('localizes', async () => {

		const h = createHandler({
			async krrumpt() {
				return [
					cmd('pah', {}),
					cmd('@me', cmd('krrumpt', {}))
				]
			}
		})

		const localized = localize('fred', h);
		const dispatch = compile(localized);

		const out = await dispatch(cmd('fred', cmd('krrumpt', {})));

		expect(out).toEqual([
			['pah'],
			['fred', ['krrumpt']]
		]);
	})
})



type Input<W extends World, M extends Machine<W>, P extends PhaseKey<M> = PhaseKey<M>> =
	readonly [P, MachineState<W, M>]

type Output<W extends World, M extends Machine<W>, P extends PhaseKey<M> = PhaseKey<M>> =
	readonly [P, MachineState<W, M>]


function localize<
	K extends string,
	I extends Cmd,
	O extends Cmd
>
	(key: K, handler: Handler<I, O>) {
		const dispatch = compile(handler);
		return [
			[key,
				async (c: I) => {
					const outs = await dispatch(c)

					return outs.map(o => {
						if(o.key == '@me') {
              return cmd(key, <I>o.body)
						}
						else {
							return o;
						}
					});
				}] as const
		]
	}


describe('driver', () => {
	

	function compileMachine<W extends World, K extends Keys<W['machines']>, M extends Machine<W, K>>(k: K, m: MachineImpl<W, M>) { //: Handler<[K, Input<W, M>], Output<W, M>> {
		const handler = Map(m.phases).toArray()
			.map(([pk, p]) => [<Keys<M['phases']>>pk, (arg: any) => {
				if(!p.guard(arg)) throw 'BAD STATE!!!';
				else {
					return p.run({}, arg)
				}
			}] as const)

		//but should localize it here too
		

		const localized = localize(k, handler);

		return localized;
	}
			// (id: K, handler: Handler<I, RO<['@me',I]>|O>): Handler<readonly [K,I], readonly [K,I]|O> {


	function compileWorld<W extends World>(w: WorldImpl<W>): (i: any) => Yield {

		const zz = Map(w.machines).toArray()
			.map(([mk, m]) => {
				const handler = compileMachine(mk, m);
				const local = localize(mk, handler);
				return local;
			});

		//and then each other handler...
		//when we boot, all these handlers should be available
		//
		

		const disp = compile(join(...zz))


		
		return async () => []
	}

	
	class Driver<W extends World> {

		private defs: WorldImpl<W>

		constructor(defs: WorldImpl<W>) {
			this.defs = defs;

			//should compile handlers here
			//...
		}

		boot<C extends Cmd>(id: Id<W>, c: C) {
			//...
		}
	}

	it('boots', async () => {

		const driver = new Driver({});

		
		const booter = createHandler({

      async boot(k: [string, string], c: Cmd) {
				//build handler
				//then dispatch to handler
				//this requires access to the driver itself

				//so - this could be a special function of the driver itself?
				//the driver needs to be able to populate its own handlers it seems
				//
				
				return []
			}

		})

		const dispatch = compile(booter)

		const out = await dispatch(['boot', ['dummy', '123'], ['hello']]);

		expect(out).toEqual([
			['dummy:123', 'hello']
		])
	})


	it('driver coroutinizes', async () =>{
		let count = 1;

		const h1 = createHandler({
			async woof() {
				return [cmd('meeow')]
			}
		})

		const h2 = createHandler({
			async meeow() {
				return count-- ? [cmd('@me', cmd('woof'))] : []
			}
		})

		const hh = localize('gaz', join(h1, h2))

		const dispatch = compile(hh)

		const out = await dispatch(['gaz', ['woof']])

		//need to drive it here

		expect(out).toEqual([
			['woof'],
			['meeow'],
			['woof'],
			['meeow'],
		])
	})

})


// function localize<
// 	I extends Command,
// 	O extends Command,
// 	K extends string>
// 		(id: K, handler: Handler<I, RO<['@me',I]>|O>): Handler<readonly [K,I], readonly [K,I]|O> {
// 			const dispatch = compile(handler);
// 			return [
// 				[id,
// 				 async (c: I) => {
// 					 const outs = await dispatch(c)

// 					 return outs.map(o => {
// 						 if(o[0] == '@me') {
// 							 return [id, <I>o[1]]
// 						 }
// 						 else {
// 							 return <O>o;
// 						 }
// 					 });
// 				}]
// 			]
// 		}

import { Command, Keyed, Cons, Tail, Yield, tail} from '../src/lib'
import { Map, Set, List } from 'immutable'


type Machine = {
	zero: any
	phases: Keyed<any>
}


type Handler<I extends Command = Command, O extends Command = Command> =
	readonly [I[0], (...args: Tail<I>) => Yield<O>][]

type HandlerMap<OK extends string = string> = {
	[k: string]: ((...args: any[]) => Yield<Command<OK>>)
}


function createHandler<OK extends string, H extends Only<HandlerMap<OK>>>(h: H): Handler<Obj2In<H>, Obj2Out<H>> {
	return Object.entries<(...r: any[]) => Yield<Obj2Out<H>>>(h)
}

type Obj2In<W extends HandlerMap> =
	Prop<{ [k in keyof W & string]: W[k] extends (...args: infer I) => any ? Cons<k, I> : never }>

type Obj2Out<W extends HandlerMap> =
	(ReturnType<W[keyof W]> extends Promise<infer S> ? (S extends Set<infer O> ? O : never) : never)
	// & Command<string>


const hm = {
	async squeak() {
		return Set([['nip'] as const])
	}
}

let hin: Obj2In<typeof hm> = ['squeak']
let hout: Obj2Out<typeof hm> = ['nip']
hin
hout


	


const dummyMachine = createHandler({
	//...
})


class Hooker {
	handle() {
		return createHandler({
			async hook(id: string, condition: string) {
				return Set([['pah!'] as const])
			}
		})
	}
}

class Delayer {
	handle() {
		return createHandler({
			async delay() {
				return Set([['aaah', 123] as const])
			},
			async delay2(ms: number) {
				return Set([['bah'] as const])
			}

		})
	}
}




//below forms a little pocket
const world = [...new Hooker().handle(), ...new Delayer().handle()]



type In<H> =
	H extends Handler[]
	? H[number] extends Handler<infer I, any> ? I : never
	: H extends Handler<infer I, any> ? I : never

type Out<H> =
	H extends Handler[]
  ? H[number] extends Handler<any, infer O> ? O : never
	: H extends Handler<any, infer O> ? O : never



class Coroutinizer<I extends Command, O extends Command> {
	
	private readonly map: Map<I[0], (...r: Tail<I>) => Yield<O>> = Map()

	constructor(handlers: Handler<I, O>) {
		this.map = Map(handlers)
	}


	async *run(boot: I): AsyncIterable<I|O> {
		let _in: Set<I|O> = Set([boot]);

		do {
			console.log(_in)

			const results = await Promise.all(
			  _in.map(([k, ...args]): Yield<O> => {
					const handler = this.map.get(k);
					return handler
					  ? handler(...<Tail<I>>args)
						: Promise.resolve(Set());
				}))

			yield * _in

			_in = Set(results).flatMap(s => s);
			
		} while(!_in.isEmpty())
	}
}

const zzzzz = [...new Delayer().handle(), ...new Hooker().handle()]
type ddddd = typeof zzzzz[number][0]



type Only<T, U extends T = T> = U & Impossible<Exclude<keyof U, keyof T>>;

type Impossible<K extends keyof any> = {
  [P in K]: never;
};

type Prop<O> = O[keyof O]

type Productify<U> =
	(U extends any ? (u: U) => void : never) extends ((p: infer P) => void) ? P : never



function join<HR extends Handler[]>(handlers: HR) : Handler<In<HR[number]>, Out<HR[number]>> {
	return <Handler<In<HR[number]>, Out<HR[number]>>>
					handlers.reduce((ac, h) => [...ac, ...h], []);
}

function compile<I extends Command, O extends Command>(handler: Handler<I, O>): (i: Command) => Yield<O> {
	const map = Map(handler)

	return async (c: Command) => {
		const found = map.get(c[0]);
		return found
		  ? await found(...tail(<I>c))
		  : Set();
	}
}

function compileCoroutine<I extends Command, O extends Command>(handler: Handler<I, O>): ((i: I) => AsyncIterable<I|O>) {
	const dispatch = compile(handler);

	return async function *(boot) {
		let _in: Set<I|O> = Set([boot]);
		
		do {
			const _out = await Promise.all(_in.map(dispatch));

			yield * _in;

			_in = Set(_out).flatMap(r => r);

		} while(!_in.isEmpty())
	}
}



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

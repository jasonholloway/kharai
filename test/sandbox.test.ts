import { Command, Keyed, Cons, Tail, Yield} from '../src/lib'
import { Map, Set } from 'immutable'


type Machine = {
	zero: any
	phases: Keyed<any>
}


type Handler<I extends Command = Command, O extends Command = Command> =
	[I[0], (...args: Tail<I>) => Yield<O>]

type HandlerMap<OK extends string = string> = {
	[k: string]: ((...args: any[]) => Yield<Command<OK>>)
}


function createHandler<OK extends string, H extends Only<HandlerMap<OK>>>(h: H): Handler<Obj2In<H>, Obj2Out<H>>[] {
	return Object.entries<(...r: any[]) => Yield<Obj2Out<H>>>(h)
}

type Obj2In<W extends HandlerMap> = Prop<{ [k in keyof W & string]: W[k] extends (...args: infer I) => any ? Cons<k, I> : never }>
type Obj2Out<W extends HandlerMap> = (Prop<W> extends (...args: any[]) => Yield<infer O> ? O : never) & Command<string>



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

	constructor(handlers: Handler<I, O>[]) {
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

const cr = new Coroutinizer([...new Delayer().handle(), ...new Hooker().handle()])


type Only<T, U extends T = T> = U & Impossible<Exclude<keyof U, keyof T>>;

type Impossible<K extends keyof any> = {
  [P in K]: never;
};

type Prop<O> = O[keyof O]

type Productify<U> =
	(U extends any ? (u: U) => void : never) extends ((p: infer P) => void) ? P : never



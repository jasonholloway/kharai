import { Command, Cons, Tail, Yield, tail, Prop, Only} from '../src/lib'
import { Map, Set } from 'immutable'

export type Handler<I extends Command = Command, O extends Command = Command> =
	readonly [I[0], (...args: Tail<I>) => Yield<O>][]

export type HandlerMap<OK extends string = string> = {
	[k: string]: ((...args: any[]) => Yield<Command<OK>>)
}


export function createHandler<OK extends string, H extends Only<HandlerMap<OK>>>(h: H): Handler<Obj2In<H>, Obj2Out<H>> {
	return Object.entries<(...r: any[]) => Yield<Obj2Out<H>>>(h)
}

export type Obj2In<W extends HandlerMap> =
	Prop<{ [k in keyof W & string]: W[k] extends (...args: infer I) => any ? Cons<k, I> : never }>

export type Obj2Out<W extends HandlerMap> =
	(ReturnType<W[keyof W]> extends Promise<infer S> ? (S extends Set<infer O> ? O : never) : never)


export type In<H> =
	H extends Handler[]
	? H[number] extends Handler<infer I, any> ? I : never
	: H extends Handler<infer I, any> ? I : never

export type Out<H> =
	H extends Handler[]
  ? H[number] extends Handler<any, infer O> ? O : never
	: H extends Handler<any, infer O> ? O : never





export function join<HR extends Handler[]>(handlers: HR) : Handler<In<HR[number]>, Out<HR[number]>> {
	return <Handler<In<HR[number]>, Out<HR[number]>>>
					handlers.reduce((ac, h) => [...ac, ...h], []);
}

export function compile<I extends Command, O extends Command>(handler: Handler<I, O>): (i: Command) => Yield<O> {
	const map = Map(handler)

	return async (c: Command) => {
		const found = map.get(c[0]);
		return found
		  ? await found(...tail(<I>c))
		  : Set();
	}
}

export function compileCoroutine<I extends Command, O extends Command>(handler: Handler<I, O>): ((i: Readonly<I>) => AsyncIterable<I|O>) {
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

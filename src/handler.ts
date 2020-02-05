import { Command, Cons, Tail, Yield, tail, Prop, Only, Lit} from './lib'
import { Map } from 'immutable'

export type Handler<I extends Command = Command, O extends Command = Command> =
	readonly [I[0], (...args: Tail<I>) => Yield<O>][]

export type HandlerMap<OK extends string = string, O extends Command<OK> = Command<OK>> = {
	[k: string]: ((...args: any[]) => Yield<Command<OK>>)
}

export function createHandler<OK extends string, O extends Command<OK>, H extends Only<HandlerMap<OK, O>>>(h: H): Handler<Obj2In<H>, Obj2Out<H>> {
	return <Handler<Obj2In<H>, Obj2Out<H>>><any>Object.entries(h) //<(...r: Tail<Obj2In<H>>) => Yield<Obj2Out<H>>>(h)
}


// type FZ = {
// 	plops(n: number): Yield<['woo']>
// 	plopsy(n: [number, number]): Yield<['wooze', number]>
// }

// type RZ = Obj2Out<FZ>

// const zz = createHandler<'woo'|'wooze', ['woo']|['wooze',number], FZ>({
// 	async plops(n: number) {
// 		return [t('woo')]
// 	},
// 	async plopsy(n: [number, number]) {
// 		return [t('wooze', 123)]
// 	}
// })


export type Obj2In<W extends HandlerMap> =
	Prop<{ [k in keyof W & string]: W[k] extends (...args: infer I) => any ? (I extends Lit[] ? Cons<k, I> : never) : never }>

export type Obj2Out<W extends HandlerMap> =
	W[keyof W] extends ((...args: any[]) => Yield<infer O>) ? (O extends Command ? O : never) : never


export type In<H> =
	H extends Handler[]
	? H[number] extends Handler<infer I, any> ? I : never
	: H extends Handler<infer I, any> ? I : never

export type Out<H> =
	H extends Handler[]
  ? H[number] extends Handler<any, infer O> ? O : never
	: H extends Handler<any, infer O> ? O : never



export function join<HR extends Handler[]>(...handlers: HR) : Handler<In<HR[number]>, Out<HR[number]>> {
	return <Handler<In<HR[number]>, Out<HR[number]>>>
					handlers.reduce((ac, h) => [...ac, ...h], []);
}


export function compile<I extends Command, O extends Command>(handler: Handler<I, O>): (i: I) => Yield<O> {
	const map = Map(handler)
	return async (c: I) => {
		const found = map.get(c[0]);
		return found
		  ? found(...tail(c))
		  : [];
	}
}


//
//
//BELOW NEEDS TO BE CONSTIFIED
//

// const h = createHandler({
// 	async ca() {
// 		return [t('cb'), t('@me', ['ca'] as const)]
// 	}
// })

export function localize<
	I extends Command,
	O extends Command,
	Id extends string>
	(id: Id, handler: Handler<I, ['@me',I]|O>): Handler<[Id,I], [Id,I]|O> {

		// if a handler outputs @mes, then these aren't emitted
		// in their place ['bazza', ['summat', 123]]
		throw 'TODO localize etc';
	}

// const lll = localize('id', h);
// lll


// export function compileCoroutine<I extends Command, O extends Command>(handler: Handler<I, O>): ((i: Readonly<I>) => Yield<I|O>) {
// 	const dispatch = compile(join(handler, ignore<I, O>()));
	
// 	return async (boot) => {
// 		let _in: List<I|O> = List([boot]);
		
// 		do {
// 			const _out = await Promise.all(_in.map(dispatch));

// 			//
// 			//but commands that are part of the same set must be done together
// 			//

// 			yield * _in;

// 			_in = List(_out).flatMap(r => r);

// 		} while(!_in.isEmpty())
// 	}
// }

export function ignore<C1 extends Command, C2 extends Command = never, C3 extends Command = never>() : Handler<C1|C2|C3, C1|C2|C3> {
	return createHandler({})
}

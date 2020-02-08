import { t, Command, Cons, Tail, Yield, tail, Prop, Only, Lit} from './lib'
import { Map } from 'immutable'
import { RO } from './util'

export type Handler<I extends Command = Command, O extends Command = Command> =
	readonly [I[0], (...args: Tail<I>) => Yield<O>][]

export type HandlerMap<OH extends string = string, OT extends any[] = any[], O extends Command<OH, OT> = Command<OH, OT>> = {
	[k: string]: ((...args: any[]) => Yield<Command<OH, OT>>)
}


export function createHandler<OH extends string, OT extends any[], O extends Command<OH, OT>, H extends Only<HandlerMap<OH, OT, O>>>(h: H): Handler<Obj2In<H>, Obj2Out<H>> {
	return <Handler<Obj2In<H>, Obj2Out<H>>><any>Object.entries(h)
}

export type Obj2In<W extends HandlerMap> =
	Prop<{ [k in keyof W & string]: W[k] extends (...args: infer I) => any ? (I extends Lit[] ? RO<Cons<k, I>> : never) : never }>

export type Obj2Out<W extends HandlerMap> =
	W[keyof W] extends ((...args: any[]) => Yield<infer O>) ? (O extends Command ? RO<O> : never) : never


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

export function localize(id: string, handler: Handler): Handler {
	const dispatch = compile(handler);
	return [[
		id,
		async (...r: Command) => {
			const res = await dispatch(r);
			return res.map(c => {
				switch(c[0]) {
					case '@me': return [id, ...tail(c)];
					default: return c;
				}
			});
		}
	]];
}


// 	const h1 = createHandler({
// 		async woof() {
// 			return [t('meeow')]
// 		}
// 	})

// 	const h2 = createHandler({
// 		async meeow() {
// 			return [['@me', ['woof'] as const]]
// 		}
// 	})

// const jj = join(h1, h2)

// const hh = localize('gaz', jj)

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

// export function ignore<C1 extends Command, C2 extends Command = never, C3 extends Command = never>() : Handler<C1|C2|C3, C1|C2|C3> {
// 	return createHandler({})
// }

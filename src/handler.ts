import { Cmd, Yield, Prop, Only, cmd, Tail, Cons, tail } from './lib'
import { Map } from 'immutable'


export type Handler<I extends Cmd = Cmd, O extends Cmd = Cmd> =
	readonly (readonly [I['parts'][0], (...r: Tail<I['parts']>) => Yield<O>])[]

export type HandlerMap<R extends any[] = any[], O extends Cmd<R> = Cmd<R>> = {
	[k: string]: ((...args: any[]) => Yield<O>)
}


export function createHandler<OR extends any[], O extends Cmd<OR>, H extends Only<HandlerMap<OR, O>>>(h: H): Handler<Obj2In<H>, Obj2Out<H>> {
	return <Handler<Obj2In<H>, Obj2Out<H>>><any>Object.entries(h)
}

export type Obj2In<W extends HandlerMap> =
	Prop<{ [k in keyof W & string]: W[k] extends (...arg: infer T) => any ? Cmd<Cons<k, T>> : never }>

export type Obj2Out<W extends HandlerMap> =
	W[keyof W] extends ((_: any) => Yield<infer O>) ? O : never


export type In<H> =
	H extends Handler[]
	? H[number] extends Handler<infer I, any> ? I : never
	: H extends Handler<infer I, any> ? I : never

export type Out<H> =
	H extends Handler[]
  ? H[number] extends Handler<any, infer O> ? O : never
	: H extends Handler<any, infer O> ? O : never



export function join<HR extends Handler[]>(...handlers: HR) : Handler<In<HR[number]>, Out<HR[number]>> {
	const result = handlers.reduce((ac, h) => [...ac, ...h] as const, [] as const);
	throw 123;
	// return <Handler<In<HR[number]>, Out<HR[number]>>><any>result;
}

// export function join<HR extends Handler[]>(...hr: HR) {
// 	throw 123;
// }

export function localize<
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
						if(o.parts[0] == '@me') {
              return cmd(key, tail(o.parts))
						}
						else {
							return o;
						}
					});
				}] as const
		]
	}




const h1 = createHandler({
	async woof() {
		return [cmd('meeow')]
	}
})

const h2 = createHandler({
	async meeow() {

		return [cmd('@me', 'woof')]
	}
})

const jj = join(h1, h2)

const hh = localize('gaz', jj)
const rrr = compile(hh)

const lll = localize('id', h);
lll








export function compile<I extends Cmd, O extends Cmd>(handler: Handler<I, O>): (i: I) => Yield<O> {
	const map = mappify(handler)
	return async (c: I) => {
		const found = map.get(c.key);
		return found ? found(c.body) : [];
	}
}


function mappify<K, V>(kvs: Iterable<readonly [K, V]>): Map<K, V> {
	return Map([...kvs].map(kv => <[K, V]>[...kv]));
}







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

// export function ignore<C1 extends Cmd, C2 extends Cmd = never, C3 extends Cmd = never>() : Handler<C1|C2|C3, C1|C2|C3> {
// 	return createHandler({})
// }

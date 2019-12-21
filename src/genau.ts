import * as random from 'random-js'
import { List } from 'immutable';

export type Gen<V> = Generator<V> | V

export type Chooser = <V>(gen: Gen<V>) => V

export class Generator<V> {
	readonly fn: (c: Chooser, r: random.Engine) => V

	constructor(fn: (choose: Chooser, r: random.Engine) => V) {
		this.fn = fn;
	}

	map<Y>(fn: (v:V)=>Gen<Y>): Generator<Y> {
		return new Generator<Y>(choose => {
			return choose(fn(choose(this)))
		});
	}
}

export function gen<V>(fn: (choose: Chooser) => V) {
	return new Generator(fn);
}

export function natural(max: number) {
	console.assert(max >= 0);
	return integer(0, max);
}

export function integer(min: number, max: number) {
	return new Generator((_, rand) => {
		return random.integer(min, max)(rand);
	})
}

export function bool(p?: number) {
	return new Generator((_, rand) => {
		return random.bool(p || 0.5)(rand);
	})
}

export function seedChooser(seed: number) {
	const rand = random.MersenneTwister19937.seed(seed);

	const _choose = <V>(gen: Gen<V>): V => {
		if(gen instanceof Generator) {
			return gen.fn(_choose, rand);
		}
		else {
			return gen;
		}
	}

	return _choose;
}

export function pick<V>(p: number, r: Gen<List<V>>): Generator<List<V>> {
	return new Generator((choose, rand) => {
		const items = choose(r);
		return items.filter(_ => random.bool(p)(rand));
	})
}

export function many<V>(c: Gen<number>, g: Gen<V>): Generator<List<V>> {
	return new Generator(choose => {
		const _c = choose(c);

		const r = [];
		for(let i = 0; i < _c; i++) {
			r.push(choose(g));
		}

		return List(r);
	})
}

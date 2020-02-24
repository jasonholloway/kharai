import { PhaseMap, PhaseMapImpl, _Phase, PhaseImpl} from './lib'


export type Dispatch<X, P> = (x: X) => (inp: P) => Promise<P>

export function buildDispatch<X, PM extends PhaseMap>(phases: PhaseMapImpl<X, PM>, path?: any[]): Dispatch<X, _Phase<PM>> {
	return x => async ([p, args]) => {
		const found = phases[p];
		if(!found) {
			throw `can't find phase ${p}!`;
		}
		else if(typeof found === 'function') {
			const fac = <PhaseImpl<PM, X, any>>found;
			const phase = fac(x);
			if(phase.guard(args)) {
				const result = await phase.run(args);
				return prepPath(path, result);
			}
			else {
				throw 'bad input!'
			}
		} 
		else {
			const nested = <PhaseMapImpl<X, PhaseMap, PM>><unknown>found;
			const dispatch = buildDispatch(nested, [path, p])(x);
			return <_Phase<PM>>await dispatch([args[0], args[1]]);
		}
	};

	function prepPath(path: any[]|undefined, result: any): _Phase<PM> {
		return !path ? result
			: (path[1] == result[0] ? prepPath(path[0], result)
			: (prepPath(path[0], [path[1], result])));
	}
}

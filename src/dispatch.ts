import { PhaseMap, PhaseMapImpl, Phase } from './lib'
import { inspect } from 'util'

type Val = any
type Name = any
type Path = readonly [Path|undefined, Name, Val]

export type Dispatch<X, P> = (x: X) => (inp: P) => Promise<P|false>

	export function buildDispatch<X, PM extends PhaseMap, P extends Phase<PM>>(phases: PhaseMapImpl<X, PM>): Dispatch<X, P> {
		return _buildDispatch<X, PM, P>([,,phases])
}

function _buildDispatch<X, PM extends PhaseMap, P extends Phase<PM>>(path: Path): Dispatch<X, P> {
	const [,,phases] = path;

	return x => async ([p, args]) => {
		const found = phases[p];
		if(!found) {
			throw `can't find phase ${p}!`;
		}
		else if(typeof found === 'function') {
			const phase = found(x);
			if(phase.guard(args)) {
				const result = await phase.run(args);
				return result && tryBind(path, result);
			}
			else {
				throw `bad input ${args}!`
			}
		} 
		else {
			const dispatch = _buildDispatch([path, p, found])(x);
			return <P>await dispatch([args[0], args[1]]);
		}
	};

	function tryBind(path: Path, curr: any): P {
		const [parent,, map] = path;

		if(map[curr[0]]) {
			return trace(path, curr)
		}
		else {
			if(!parent) throw Error(`can't bind ${curr}! ${inspect(map)}`);
			return tryBind(parent, curr);
		}

		function trace(path: Path, curr: any): P {
			const [parent, name] = path;
			return parent
			  ? trace(parent, [name, curr])
			  : curr;
		}
	}
}

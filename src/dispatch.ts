import { PhaseMap, PhaseMapImpl, Phase } from './lib'
import { inspect } from 'util'

type Val = any
type Name = any
type Path = readonly [Path|undefined, Name, Val]

export type Dispatch<X, P> = (x: X) => (inp: P) => Promise<P|false>

export function buildDispatch<X, PM extends PhaseMap>(phases: PhaseMapImpl<X, PM>): Dispatch<X, Phase<PM>> {
	return _buildDispatch<X, PM>([,,phases])
}

function _buildDispatch<X, PM extends PhaseMap>(path: Path): Dispatch<X, Phase<PM>> {
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
			return <Phase<PM>>await dispatch([args[0], args[1]]);
		}
	};

	function tryBind(path: Path, curr: any): Phase<PM> {
		const [parent,, map] = path;

		if(map[curr[0]]) {
			return trace(path, curr)
		}
		else {
			if(!parent) throw Error(`can't bind ${curr}! ${inspect(map)}`);
			return tryBind(parent, curr);
		}

		function trace(path: Path, curr: any): Phase<PM> {
			const [parent, name] = path;
			return parent
			  ? trace(parent, [name, curr])
			  : curr;
		}
	}
}

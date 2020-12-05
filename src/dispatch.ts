import { PhaseMap, PhaseMapImpl, MachineContext } from './lib'
import { inspect, isArray, isString } from 'util'

type Val = any
type Name = any
type Path = readonly [Path|undefined, Name, Val]

export type Dispatch<P, X> = (x: X) => (inp: P) => Promise<P|false>

export function buildDispatch<PM extends PhaseMap, P, X extends MachineContext<P> = MachineContext<P>>(
	phases: PhaseMapImpl<X, PM>
): Dispatch<P, X>
{
	return _buildDispatch<P, X>([,,phases])
}

function _buildDispatch<P, X extends MachineContext<P> = MachineContext<P>>(
	path: Path
): Dispatch<P, X>
{
	const [,,phases] = path;

	return x => async (m) => {
		if(checkMessage(m)) {
			const [p, args] = m;

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
				if(isArray(args)) {
					const dispatch = _buildDispatch([path, p, found])(x);
					return <P>await dispatch([args[0], args[1]]);
				}
			}
		}

		throw Error(`Badly formed message: ${m}`)
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

function checkMessage(m: any): m is [string, unknown] {
	return isArray(m) && isString(m[0]);
}

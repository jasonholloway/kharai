import _Monoid, { _MonoidNumber } from './_Monoid'
import AtomSpace, { Lump } from './AtomSpace'
import { Saver } from './Store'
import { Set } from 'immutable'
import { inspect } from 'util'
import { AtomRef } from './atoms'

inspect.defaultOptions.depth = 10;

type Acc = {}

const MAc: _Monoid<Acc> = {
	zero: {},
	add() {
		return {};
	}
} 

//below 
//
//

export default class AtomSaver<V> {
	private _monoidV: _Monoid<V>;
	private _space: AtomSpace<V>;
	
	constructor(monoidV: _Monoid<V>, space: AtomSpace<V>) {
		this._monoidV = monoidV;
		this._space = space;
	}

	async save(store: Saver<V>, refs: Set<AtomRef<V>>): Promise<Lump<V>> {
		const MV = this._monoidV;
		const space = this._space;

		//TODO
		//lockTips ensures we have the latest reformed roots locked
		//but we should resample the heads at this point too - if we have their roots locked, we should
		//be free to take the latest here, as heads can only move forwards
		//(as is we'll always be saving out-of-date state)
		//the crap approach would give us a free path too to tackling the totting-up approach to weight management

		const path = await space.lockPath(...refs);

		// renderAtoms(path.tips)
		// log(tracePath(path.tips))

		let mode: 'gather'|'zipUp' = 'gather';
		let bagged = MV.zero;
		let save = () => Promise.resolve();
		let gatherables: Set<AtomRef<V>> = Set();
		let roots: Set<AtomRef<V>> = Set();
		let weight = 0;

		try {
			path.rewrite<Acc>(
				self => ([ref, atom]) => {

					if(mode == 'zipUp') {
						return [MAc.zero];
					}

					const [ac, parents] = self(atom.parents);

					switch(<'gather'|'zipUp'>mode) { //ts mucks up closed-over lets
						case 'zipUp':
							return [ac, [[ref], atom.with({ parents })]]

						case 'gather':
							const combo = MV.add(bagged, atom.val);
							const canSave = store.prepare(combo);

							if(!canSave) {
								mode = 'zipUp';
								return [ac, [[ref], atom.with({ parents })]];
							}

							bagged = combo;
							save = () => canSave.save();
							gatherables = gatherables.add(ref);
							weight += atom.weight;

							return [ac,
								[
									[...gatherables, ref],
									atom.with({
										state: 'taken',
										parents: roots.toList(),
										weight,
										val: bagged
									})
								]
							];
					}
				}, MAc).complete();

			// space.incStaged(weight);
			
			// renderAtoms(path.tips)
			// log(tracePath(path.tips))
		}
		finally {
			path.release();
		}

		//and now we can queue up a save on the tails of the roots
		//...

		await save();

		return [weight, gatherables];

		//plus we could 'top up' our current transaction till full here
		//by taking latest refs from head
		//...
	}
}

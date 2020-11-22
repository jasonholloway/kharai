import _Monoid, { _MonoidNumber } from './_Monoid'
import AtomSpace, { Head } from './AtomSpace'
import Store from './Store'
import { Map, Set } from 'immutable'
import { inspect } from 'util'
import { renderAtoms, renderPath } from './AtomPath'
import { Atom, AtomRef } from './atoms'

inspect.defaultOptions.depth = 10;
const log = (...r: any[]) => console.dir(...r);

export default class AtomSaver<V> {
	private _monoidV: _Monoid<V>;
	private _space: AtomSpace<V>;
	private _saves: Map<Atom<V>, Promise<void>>
	
	constructor(monoidV: _Monoid<V>, space: AtomSpace<V>) {
		this._monoidV = monoidV;
		this._space = space;
		this._saves = Map();
	}

	//TODO
	//saving should skip if there's already a save in progress with <= weight threshold

	async save(store: Store<V>, heads: Set<Head<V>>): Promise<void> {
		const M = this._monoidV;
		const space = this._space;

		//TODO
		//lockTips ensures we have the latest reformed roots locked
		//but we should resample the heads at this point too - if we have their roots locked, we should
		//be free to take the latest here, as heads can only move forwards
		//(as is we'll always be saving out-of-date state)

		//the crap approach would give us a free path too to tackling the totting-up approach to weight management
		//TODO track overall weight in AtomSpace; drive saving from outside the rewrite

		//TODO
		//two rewrites and a special lock
		//we need to keep tabs on weight created, weight being saved, and weight saved
		//we don't then need to destroy weight on rewrites - we just need to keep the accounting straight

		// log(space.weights())
		renderAtoms(heads.flatMap(h => h.refs()));

		while(space.weights().pending > 0) {
			const path = await space
				.lockPath(...heads.flatMap(h => h.refs()));

			try {
				let mode: 'gather'|'zipUp' = 'gather';
				let bagged = M.zero;
				let save = () => Promise.resolve();

				path.rewrite<number>(recurse => (ac0, [ref, atom]) => {

					if(!atom.isActive()) {
						return [ac0, [[ref], atom]]; //would be nice to have special 'false' case here
					}

					const [ac1, parents] = atom.parents
						.reduce<[number, Set<AtomRef<V>>]>(
							([ac,rs], r) => {
								switch(mode) {
									case 'zipUp':
										return [ac, rs.add(r)];

									case 'gather':
										const [ac2, r2, stale] = recurse(ac, r); //will blow stack
										return [ac + ac2, rs.add(r2)];
								}
							}, [ac0, Set()]);

					//and now consider myself
					switch(mode) {
						case 'zipUp':
							return [ac1, [[ref], atom.with({ parents })]];

						case 'gather':
							const combo = M.add(bagged, atom.val);
							const canSave = store.prepare(combo);

							if(!canSave) {
								mode = 'zipUp';
								return [ac1, [[...parents, ref], atom.with({ parents: Set() })]];
							}
							else {
								bagged = combo;
								save = () => canSave.save(); //but what about saves that sit in other branches? should be passed as ac
								space.incStaged(atom.weight)
								//add weight of parents here
								return [ac1, [[...parents, ref], atom.with({ parents: Set(), state: 'taken' })]];
							}
					}

				}, new _MonoidNumber()).complete();

				await save();

				log(space.weights())
				renderAtoms(path.tips);
			}
			finally {
				path.release();
			}
		}

		//plus we could 'top up' our current transaction till full here
		//by taking latest refs from head
		//...
	}
}

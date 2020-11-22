import _Monoid, { _MonoidNumber } from './_Monoid'
import AtomSpace, { Head } from './AtomSpace'
import Store from './Store'
import { Map, Set } from 'immutable'
import { inspect } from 'util'
import { renderAtoms, renderPath } from './AtomPath'
import { Atom } from './atoms'

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

		log(space.weights())
		renderAtoms(heads.flatMap(h => h.refs()));

		while(space.weights().pending > 0) {
			const path = await space
				.lockPath(...heads.flatMap(h => h.refs()));

			try {
				let mode: 'gatherFromRoots'|'zipToTips' = 'gatherFromRoots';
				let bagged = M.zero;
				let save = () => Promise.resolve();

				path.rewrite<number>(recurse => (ac, [ref, atom]) => {
					//TODO should only delve if 
					const parents = atom.parents.map(recurse); //depth-first (will blow stack if too big...)
					const parentAtoms = parents.flatMap(r => r.resolve());

					//TODO SHOULDN'T EVEN COPY NON-PENDING!!!!!
					//...

					//TODO reuse untouched root fragments
					//...

					//so on first rewrite, we are consolidating an atom to 'claim' it
					//we lock to the root ()
					//

					switch(mode) {
						case 'gatherFromRoots':
							const upstreamCombo = M.add(
								bagged,
								parentAtoms
									.filter(a => a.isActive())
									.map(a => a.val)
									.reduce(M.add, M.zero)
							);
							const canSave1 = store.prepare(upstreamCombo);
							if(canSave1) {
								bagged = upstreamCombo;
								save = () => canSave1.save();
							}
							else {
								mode = 'zipToTips'
								return [[ref], atom.with({ parents })];
							}

							const combo = atom.isActive() ? M.add(bagged, atom.val) : bagged; //TODO this would be better cutting off recursion
							const canSave2 = store.prepare(combo);
							if(canSave2) {
								bagged = combo;
								save = () => canSave2.save();
								space.incStaged(atom.weight)
								//add weight of parents here
								return [[...parents, ref], atom.with({ parents: Set(), state: 'taken' })];
							}
							else {
								mode = 'zipToTips'
								//add weight of parents here
								return [[...parents, ref], atom.with({ parents: Set() })];
							}

						case 'zipToTips':
							return [[ref], atom.with({ parents })];
					}
				}, new _MonoidNumber()).complete();

				//THE ABOVE DOESN'T WORK WITH MULTIPLE HEADS... as the one winning 'save' won't cover its siblings
				//!!!!!!!1

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

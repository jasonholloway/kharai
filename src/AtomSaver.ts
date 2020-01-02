import _Monoid from './_Monoid'
import AtomSpace, { Head } from './AtomSpace'
import Store from './Store'
import { Set } from 'immutable'
import { Atom } from './atoms'

export default class AtomSaver<V> {
	private _monoidV: _Monoid<V>;
	private _space: AtomSpace<V>;
	
	constructor(monoidV: _Monoid<V>, space: AtomSpace<V>) {
		this._monoidV = monoidV;
		this._space = space;
	}

	async save(store: Store<V>, heads: Set<Head<V>>): Promise<void> {
		const M = this._monoidV;

		const path = await this._space.lockTips(...heads.map(h => h.ref()));
		//after getting the lock, we should ensure the roots are still the roots...
		//should this be done as part of lockTips?

		try {
			while(path.hasAtoms()) {
				let mode: 'gather'|'copy' = 'gather';
				let bagged = M.zero;
				let save = () => Promise.resolve();

				const patch = path.rewrite(fn => (ref, atom) => {
					const parents = atom.parents.map(fn);
					switch(mode) {
						case 'gather':
							const upstreamCombo = M.add(
								bagged,
								parents
									.map(ref => ref.resolve()?.val || M.zero)
									.reduce(M.add, M.zero)
							);
							const canSave1 = store.prepare(upstreamCombo);
							if(canSave1) {
								bagged = upstreamCombo;
								save = () => canSave1.save();
							}
							else {
								mode = 'copy'
								return [[ref], new Atom(parents, atom.val)];
							}

							const combo = M.add(bagged, atom.val);
							const canSave2 = store.prepare(combo);
							if(canSave2) {
								bagged = combo;
								save = () => canSave2.save();
								return [[...parents, ref], null];
							}
							else {
								mode = 'copy'
								return [[...parents, ref], new Atom(Set(), atom.val)];
							}

						case 'copy':
							return [[ref], new Atom(parents, atom.val)];
					}
				});

				await save();

				patch.complete();
			}
		}
		finally {
			path.release();
		}

		//plus we could 'top up' our current transaction till full here
		//by taking latest refs from head
		//...
	}
}

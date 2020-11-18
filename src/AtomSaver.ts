import _Monoid from './_Monoid'
import AtomSpace, { Head } from './AtomSpace'
import Store from './Store'
import { Set } from 'immutable'
import { Atom } from './atoms'
const log = console.log;

export default class AtomSaver<V> {
	private _monoidV: _Monoid<V>;
	private _space: AtomSpace<V>;
	
	constructor(monoidV: _Monoid<V>, space: AtomSpace<V>) {
		this._monoidV = monoidV;
		this._space = space;
	}

	async save(store: Store<V>, heads: Set<Head<V>>): Promise<void> {
		const M = this._monoidV;

		//lock everything all at once, until stable; with risk of contention
		const path = await this._space.lockTips(...heads.flatMap(h => h.refs()));

		//TODO
		//lockTips ensures we have the latest reformed roots locked
		//but we should resample the heads at this point too - if we have their roots locked, we should
		//be free to take the latest here, as heads can only move forwards
		//(as is we'll always be saving out-of-date state)

		try {
			//save and rewrite locked path till all done
			while(path.hasAtoms(a => !a.saved)) {
				let mode: 'gather'|'copy' = 'gather';
				let bagged = M.zero;
				let save = () => Promise.resolve();

				const patch = path
					.rewrite(recurse => (ref, atom) => {
						const parents = atom.parents.map(recurse); //depth-first (will blow stack if too big...)
						switch(mode) {
							case 'gather':
								const upstreamCombo = M.add(
									bagged,
									parents
										.flatMap(r => r.resolve())
									  .filter(a => !a.saved)
										.map(a => a.val)
										.reduce(M.add, M.zero)
								);
								const canSave1 = store.prepare(upstreamCombo);
								if(canSave1) {
									//stage parents
									bagged = upstreamCombo;
									save = () => canSave1.save();
								}
								else {
									//parents exceed batch
									mode = 'copy'
									return [[ref], new Atom(parents, atom.val, atom.saved)];
								}

								const combo = atom.saved ? bagged : M.add(bagged, atom.val);
								const canSave2 = store.prepare(combo);
								if(canSave2) {
									//save everything
									bagged = combo;
									save = () => canSave2.save();
									return [[...parents, ref], new Atom(Set(), atom.val, true)];
								}
								else {
									//saved parents, but not the local atom
									mode = 'copy'
									return [[...parents, ref], new Atom(Set(), atom.val)];
								}

							case 'copy':
								return [[ref], new Atom(parents, atom.val, atom.saved)];
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

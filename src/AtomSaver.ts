import _Monoid from './_Monoid'
import AtomSpace, { Head } from './AtomSpace'
import Store from './Store'
import { Set } from 'immutable'
import { Atom } from './atoms'
import { inspect } from 'util'
import { renderAtoms } from './AtomPath'

inspect.defaultOptions.depth = 10;
const log = (...r: any[]) => console.dir(...r);

export default class AtomSaver<V> {
	private _monoidV: _Monoid<V>;
	private _space: AtomSpace<V>;
	
	constructor(monoidV: _Monoid<V>, space: AtomSpace<V>) {
		this._monoidV = monoidV;
		this._space = space;
	}

	async save(store: Store<V>, heads: Set<Head<V>>): Promise<void> {
		const M = this._monoidV;
		const newAtom = this._space.newAtom.bind(this._space);

		const tips = heads.flatMap(h => h.refs());

		//lock everything all at once, until stable; with risk of contention
		const path = await this._space.lockTips(...tips);

		//TODO
		//lockTips ensures we have the latest reformed roots locked
		//but we should resample the heads at this point too - if we have their roots locked, we should
		//be free to take the latest here, as heads can only move forwards
		//(as is we'll always be saving out-of-date state)

		try {
			//save and rewrite locked path till all done
			while(path.hasPendingAtoms()) {
				let mode: 'gather'|'copy' = 'gather';
				let bagged = M.zero;
				let save = () => Promise.resolve();

				const patch = path
					.rewrite(recurse => (ref, atom) => {
						const parents = atom.parents.map(recurse); //depth-first (will blow stack if too big...)
						//TODO SHOULDN'T EVEN COPY NON-PENDING!!!!!
						//...


						//TODO
						//need to remove weight of removed atoms somehow
						//...
						
						switch(mode) {
							case 'gather':
								const upstreamCombo = M.add(
									bagged,
									parents
										.flatMap(r => r.resolve())
									  .filter(a => a.weight)
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
									return [[ref], newAtom(parents, atom.val, atom.weight)];
								}

								const combo = atom.weight ? M.add(bagged, atom.val) : bagged; //TODO this would be better cutting off recursion
								const canSave2 = store.prepare(combo);
								if(canSave2) {
									//save everything
									bagged = combo;
									save = () => canSave2.save();
									return [[...parents, ref], newAtom(Set(), atom.val, 0)];
								}
								else {
									//saved parents, but not the local atom
									mode = 'copy'
									return [[...parents, ref], newAtom(Set(), atom.val)];
								}

							case 'copy':
								return [[ref], newAtom(parents, atom.val, atom.weight)];
						}
					});

				renderAtoms(path.tips);

				await save();

				patch.complete();
			}

			renderAtoms(path.tips);
		}
		finally {
			path.release();
		}

		//plus we could 'top up' our current transaction till full here
		//by taking latest refs from head
		//...
	}
}

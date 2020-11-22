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
		const MV = this._monoidV;
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

		const MAc: _Monoid<Acc> = {
			zero: {
				mode: 'gather',
				bagged: MV.zero,
				weight: 0
			},
			add(a1, a2) {
				return {
					mode: [a1.mode, a2.mode].includes('zipUp') ? 'zipUp' : 'gather',
					bagged: MV.add(a1.bagged, a2.bagged),
					weight: a1.weight + a2.weight,
					save: a2.save || a1.save || undefined
				};
			}
		} 

		renderAtoms(heads.flatMap(h => h.refs()));

		while(space.weights().pending > 0) {

			const path = await space
				.lockPath(...heads.flatMap(h => h.refs()));

			try {
				const result = path.rewrite<Acc>(
					recurse => (ac0, [ref, atom]) => {

						if(!atom.isActive()) {
							return [ac0];
						}

						const [ac1, parents] = atom.parents
							.reduce<[Acc, Set<AtomRef<V>>]>(
								([ac,rs], r) => {
									switch(ac.mode) {
										case 'zipUp':
											return [ac, rs.add(r)];

										case 'gather':
											const [ac2, r2, dupe] = recurse(ac, r); //will blow stack
											return [
												!dupe ? ac2 : ac,
												rs.add(r2)
											];
									}
								}, [ac0, Set()]);

						//and now consider myself
						switch(ac1.mode) {
							case 'zipUp':
								return [
									ac1,
									[[ref], atom.with({ parents })]
								];

							case 'gather':
								const combo = MV.add(ac1.bagged, atom.val);
								const canSave = store.prepare(combo);

								if(!canSave) {
									return [
										{
											...ac1,
											mode: 'zipUp'
										},
										[[ref], atom.with({ parents })]
									];
								}

								const weight = ac1.weight + atom.weight;
								const takenParents = parents
										.filter(r => r.resolve().some(a => !a.isActive()));
								//TODO above would be better specially accumulated
								//or rather, Gatherables should be accumulated

								//THIS DOESN'T WORK!
								//because upstream atoms are being set as 'taken', and the downstream
								//visitor misrecognises them as 'already taken'
								//...

								return [
									{
										...ac1,
										bagged: combo,
										weight,
										save: () => canSave.save()
									},
									[
										[...parents.subtract(takenParents), ref], //should only be claiming active atoms
										atom.with({
											parents: takenParents,
											state: 'taken',
											weight
										})
									]
								];
						}
					}, MAc).complete();

				space.incStaged(result.weight);

				if(result.save) {
					log(result.bagged)
					await result.save();
				}

				renderAtoms(path.tips);
			}
			finally {
				path.release();
			}
		}

		type Acc = {
			mode: 'gather'|'zipUp'
			bagged: V
			weight: number
			save?: () => Promise<void>
		}

		//plus we could 'top up' our current transaction till full here
		//by taking latest refs from head
		//...
	}

	//TODO
	//upstreams of takens aren't disappearing...
	//ie consolidation isn't happening
	//

}

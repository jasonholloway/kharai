import _Monoid, { _MonoidNumber } from './_Monoid'
import AtomSpace, { Head } from './AtomSpace'
import Store from './Store'
import { Map, Set, List } from 'immutable'
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

		//PROBLEM
		//so threading ac doesn't work so well with monoids
		//monoids do work with bottom-up aggregation, complete with special rule
		//for not claiming dupes

		//we want weights to be selectively added, ie not from dupes
		//but bagged and save and mode are part of a threaded context
		//for which we can use the closure

		//weights and roots in fact
		//roots are an aggregation like parents
		//so each atom offers itself via monoidal ac as parent or root

		//parent, root and gatherable via ac
		//mode, save and bagged by closure
		//
		//weight is a function of gatherable of course, so maybe we can ignore it until we do the final merge

		const MAc: _Monoid<Acc> = {
			zero: {
				gatherables: Set(),
				roots: Set(),
				weight: 0
			},
			add(a1, a2) {
				return {
					gatherables: a1.roots.union(a2.gatherables),
					roots: a1.roots.union(a2.roots),
					weight: a1.weight + a2.weight
				};
			}
		} 

		renderAtoms(heads.flatMap(h => h.refs()).toList());

		while(space.weights().pending > 0) {

			const path = await space
				.lockPath(...heads.flatMap(h => h.refs()));

			try {
				let mode: 'gather'|'zipUp' = 'gather';
				let bagged = MV.zero;
				let save = () => Promise.resolve();

				const {weight} = path.rewrite<Acc>(
					recurse => ([ref, atom]) => {

						if(!atom.isActive()) {
							return [{
								roots: Set([ref]),
								gatherables: Set(),
								weight: 0
							}];
						}

						const [ac, parents] = atom.parents
							.reduce<[Acc,List<AtomRef<V>>]>(([ac1,rs], r) => {
								switch(mode) {
									case 'zipUp':
										return [ac1, rs.push(r)];

									case 'gather':
										const [ac2, r2] = recurse(r); //will blow stack
										if(ac2) return [MAc.add(ac1, ac2), rs.push(r2)];     //would be much more pleasant underneath...
										else return [ac1, rs.push(r2)];
								}
							}, [MAc.zero,List()]);

						//and now consider myself
						switch(mode) {
							case 'zipUp':
								return [ac, [[ref], atom.with({ parents })]]

							case 'gather':
								const combo = MV.add(bagged, atom.val);
								const canSave = store.prepare(combo);

								if(!canSave) {
									mode = 'zipUp';
									return [ac, [[ref], atom.with({ parents })]];
								}

								log('gathering', atom.val, atom.weight);

								bagged = combo;
								save = () => canSave.save();

								return [
									{
										...ac,
										gatherables: ac.gatherables.add(ref),
										weight: ac.weight + atom.weight
									},
									[
										[...ac.gatherables, ref],
										atom.with({
											state: 'taken',
											parents: ac.roots.toList(),
											weight: ac.weight + atom.weight
										})
									]
								];
						}
					}, MAc).complete();

				space.incStaged(weight);

				await save();

				// renderAtoms(heads.flatMap(f => f.refs()));
				renderAtoms(path.tips);
			}
			finally {
				path.release();
			}
		}

		type Acc = {
			roots: Set<AtomRef<V>>
			gatherables: Set<AtomRef<V>>
			weight: number
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

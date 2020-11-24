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
				parents: Set(),
				gatherables: Set(),
				roots: Set()
			},
			add(a1, a2) {
				return {
					parents: a1.roots.union(a2.parents),
					gatherables: a1.roots.union(a2.gatherables),
					roots: a1.roots.union(a2.roots)
				};
			}
		} 

		renderAtoms(heads.flatMap(h => h.refs()));

		while(space.weights().pending > 0) {

			const path = await space
				.lockPath(...heads.flatMap(h => h.refs()));

			try {
				let mode: 'gather'|'zipUp' = 'gather';
				let bagged = MV.zero;
				let save = () => Promise.resolve();

				const result = path.rewrite<Acc>(
					recurse => ([ref, atom]) => {

						if(!atom.isActive()) {
							return [{
								parents: Set([ref]),
								roots: Set([ref]),
								gatherables: Set()
							}];
						}

						const ac = atom.parents
							.reduce<Acc>((ac1, r) => {
								switch(mode) {
									case 'zipUp':
										return {
											...ac1,
											parents: ac1.parents.add(r)
										};

									case 'gather':
										const [ac2, r2, dupe] = recurse(r); //will blow stack
										return {
											...ac2,
											parents: ac1.parents.union(ac2.parents),                         //are any of these affected by dupe?
											gatherables: ac1.gatherables.union(ac2.gatherables),
											roots: ac1.roots.union(ac2.roots)
										};
								}
							}, MAc.zero);

						//and now consider myself
						switch(mode) {
							case 'zipUp':
								return [
									{
										...ac,
										parents: Set([ref])
									},
									[[ref], atom.with({ parents: ac.parents })]
								];

							case 'gather':
								const combo = MV.add(bagged, atom.val);
								const canSave = store.prepare(combo);

								if(!canSave) {
									mode = 'zipUp';
									return [
										{
											...ac,
											parents: Set([ref])
										},
										[[ref], atom.with({ parents: ac.parents })]
									];
								}

								log('gathering', atom.val, 'plus', ac.gatherables.count());

								bagged = combo;
								save = () => canSave.save();

								return [
									{
										...ac,
										parents: Set([ref]),
										gatherables: ac.gatherables.add(ref)
									},
									[
										[...ac.gatherables, ref],
										atom.with({
											parents: ac.roots,
											state: 'taken',
											weight: ac.gatherables
												.flatMap(r => r.resolve())
												.reduce((w, a) => a.weight + w, atom.weight) //cripes - should gather in ac (except for dupe problem)
										})
									]
								];
						}
					}, MAc).complete();

				const weight = result.gatherables
					.flatMap(r => r.resolve())
					.reduce((w, a) => w + a.weight, 0); //except - we have just rewritten, and redirected

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
			parents: Set<AtomRef<V>>
			roots: Set<AtomRef<V>>
			gatherables: Set<AtomRef<V>>
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

import { Id, Data, WorldImpl, PhaseMap, Phase, MachineContext } from './lib'
import { Head } from './AtomSpace'
import { Mediator, Convener, Attendee, Peer } from './Mediator'
import { Observable, Subject, from, merge, ReplaySubject } from 'rxjs'
import { flatMap, skipWhile, startWith, mergeAll, endWith, scan, takeWhile, finalize, publish, toArray, map, mergeMap, tap } from 'rxjs/operators'
import Commit, { AtomEmit } from './Committer'
import { Map, Set } from 'immutable'
import { Dispatch } from './dispatch'
import { isArray } from 'util'
import MonoidData from './MonoidData'
import { AtomRef, Atom } from './atoms'

export type Emit<P = any> =
		readonly [Id, P] | AtomEmit<Data>

export class Run<W extends PhaseMap, X extends MachineContext, P> {
  private readonly space: MachineSpace<W, X, P>
  private readonly mediator: Mediator
  private readonly log$$: Subject<Observable<Emit<P>>>

  log$: Observable<Emit<P>>

  constructor(space: MachineSpace<W, X, P>, mediator: Mediator) {
    this.space = space;
    this.mediator = mediator;
    this.log$$ = new Subject();
    this.log$ = this.log$$.pipe(mergeAll());

		const count$ = this.log$$.pipe(
			flatMap(l => l.pipe(
				skipWhile<any>(_ => true),
				startWith<number>(1),
			  endWith<number>(-1),
				)),
			scan((c, n) => c + n, 0));

		count$.pipe(
			takeWhile(c => c > 0),
			finalize(() => this.log$$.complete())
		).subscribe();
  }
  
  async meet<R = any>(ids: Id[], convener: Convener<R>): Promise<R> {
    const machine$ = publish<IMachine<P>>()(this.space.summon(Set(ids)));

    this.log$$.next(machine$.pipe(flatMap(m => m.log$)))
    const gathering = machine$.pipe(toArray()).toPromise();
    machine$.connect();

    return await this.mediator
      .convene(convener, Set(await gathering));
  }

  tell(id: Id, m: any) {
    return this.meet([id], { convene([p]) { return p.chat([m]) } });
  }

  boot(id: Id, p: Phase<W>) {
    return this.tell(id, p);
  }
}


export type DataLoader<P> = (ids: Set<Id>) => Promise<Map<Id, [Head<Data>, P?]>>
export type MachineLoader<P> = (id: Id) => Promise<[Head<Data>, P]>

export class MachineSpace<W extends PhaseMap = {}, X extends MachineContext = MachineContext, P = Phase<W>> {
  private readonly world: WorldImpl<W, X>
  private readonly loader: MachineLoader<P>
  private readonly mediator: Mediator
  private readonly dispatch: Dispatch<X, P>
  private machines: Map<Id, Promise<Machine<X, P>>>

  private _log$$: Subject<Observable<Emit<P>>>
  readonly log$: Observable<Emit<P>>

  constructor(world: WorldImpl<W, X>, loader: MachineLoader<P>, dispatch: Dispatch<X, P>) {
    this.world = world;
    this.loader = loader;
    this.dispatch = dispatch;
    this.mediator = new Mediator();
    this.machines = Map();

    this._log$$ = new Subject();
    this.log$ = this._log$$.pipe(mergeAll());
  }

	complete() {
		this._log$$.complete();
	}

  newRun(): Run<W, X, P> {
    return new Run(this, this.mediator);
  }

  summon(ids: Set<Id>): Observable<IMachine<P>> {
    const summoned = ids.map(id => {
      const found = this.machines.get(id);
      if(found) {
        return [false, id, found] as const;
      }
      else {
        const loading = this.loader(id);

        return [
          true,
          id,
          loading.then(([head, phase]) => {
            const machine: Machine<X, P> = new Machine<X, P>(
              this.asSpace(),
							this.dispatch,
							this.world.contextFac,
						  h => new Commit<Data>(new MonoidData(), h)
						);

            this._log$$.next(machine.log$);

            machine.begin(id, head, phase);

            //head needs to be property on machine, not just closure thing
            //and exposed too via IMachine
            //...

            return machine;
          })
        ] as const;
      }
    })

    const toAdd = summoned
      .filter(([isNew]) => isNew)
      .map(([, id, loading]) => <[Id, Promise<Machine<X, P>>]>[id, loading]);
    
    this.machines = this.machines.merge(Map(toAdd));

    return merge(...(summoned.map(
      ([,, loading]) => from(loading))
    ));
  }

  private asSpace(): ISpace {
    const _this = this;
    return {
      watch(ids: Id[]): Observable<AtomRef<Data>> {
        return _this.summon(Set(ids))
          .pipe(
            mergeMap(m => m.atom$)
          );
      },

      async attach<R>(me: any, attend: Attendee<R>): Promise<false|[R]> {
        return _this.mediator.attach(me, attend);
      },

      async convene<R>(ids: Id[], convene: Convener<R>): Promise<R> {
        const machine$ = _this.summon(Set(ids));
        return await _this.mediator
          .convene(convene, Set(await machine$.pipe(toArray()).toPromise()));
      }
    }
  }
}

interface ISpace {
  watch(ids: Id[]): Observable<AtomRef<Data>>
  attach<R>(me: any, attend: Attendee<R>): Promise<false|[R]>
  convene<R>(ids: Id[], convene: Convener<R>): Promise<R>
}



type CommitFac = (h: Head<Data>) => Commit<Data>

export class Machine<X, P> implements IMachine<P> {
  private _log$: Subject<Emit<P>>
  private _atom$: Subject<AtomRef<Data>>
  private space: ISpace
  private dispatch: Dispatch<X, P>
  private modContext: (x: MachineContext) => X
	private commitFac: CommitFac

  readonly log$: Observable<Emit<P>>
  readonly atom$: Observable<AtomRef<Data>>
  
  constructor(space: ISpace, dispatch: Dispatch<X, P>, modContext: (x: MachineContext) => X, commitFac: CommitFac) {
    this._log$ = new ReplaySubject(1);
    this.log$ = this._log$;

    this._atom$ = new ReplaySubject(1);
    this.atom$ = this._atom$;

    this.space = space;
    this.dispatch = dispatch;
    this.modContext = modContext;
		this.commitFac = commitFac;
  }

  begin(id: Id, head: Head<Data>, phase: P) {
    const log$ = this._log$;
    const atom$ = this._atom$;
    const dispatch = this.dispatch.bind(this);
    const buildContext = this.buildContext.bind(this);

    head.refs().forEach(r => atom$.next(r));
    //AND NOW! special root atom should be marked as already-persisted, otherwise will incur unnecessary overwrite

    setImmediate(() => (async () => {     
        while(true) {
          log$.next([id, phase]);

          const committer = this.commitFac(head);
          const context = buildContext(committer);
          const out = await dispatch(context)(phase);

          if(out) {
            let atom: AtomRef<Data>;
            [head, atom] = await committer.complete(Map({ [id]: out }));
            atom$.next(atom);
            phase = out;
          }
          else {
            break;
          }
        }
      })()
      .catch(log$.error.bind(log$))
      .finally(() => {
        atom$.complete();
        log$.complete();
      }));
  }

	private static $Internal = Symbol('CommitCtx')
  
  private buildContext(commit: Commit<Data>): X {
    const me = this;
    const space = this.space;;

    return this.modContext({
      watch(ids: Id[]): Observable<Data> {
        return space.watch(ids)
          .pipe(
            tap(r => commit.add(Set([r]))), //gathering all watched atomrefs here into mutable Commit
            mergeMap(r => r.resolve()), //empty refs get gathered too of course (to test for)
            map(a => a.val)
            //todo filter on passed ids
          );
      },
      attach<R>(attend: Attendee<R>) {
        return space.attach(me, {
					chat(m, peers) {
						if(isArray(m) && m[0] == Machine.$Internal) {
							Commit.combine(new MonoidData(), [commit, <Commit<Data>>m[1]]);
							m = m[2];
						}

						const proxied = peers.map(p => <Peer>({
							chat(m) {
								return p.chat([Machine.$Internal, commit, m]);
							}
						}));
						return attend.chat(m, proxied);
					}
				});
      },
      convene<R>(ids: Id[], convene: Convener<R>) {
        return space.convene(ids, {
					convene(peers) {
						const proxied = peers.map(p => <Peer>({
							chat(m) {
								return p.chat([Machine.$Internal, commit, m]);
							}
						}));
						return convene.convene(proxied);
					}
				});
      }
    });
  }
}


interface IMachine<P> {
  readonly log$: Observable<Emit<P>>
  readonly atom$: Observable<AtomRef<Data>>
}

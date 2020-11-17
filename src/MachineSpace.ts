import { Id, Data, WorldImpl, PhaseMap, Phase, MachineContext } from './lib'
import { Head } from './AtomSpace'
import { Mediator, Convener, Attendee, Peer } from './Mediator'
import { Observable, Subject, from, merge, ReplaySubject, BehaviorSubject } from 'rxjs'
import { toArray, map, mergeMap, tap } from 'rxjs/operators'
import Commit, { AtomEmit } from './Committer'
import { Map, Set } from 'immutable'
import { Dispatch } from './dispatch'
import { isArray } from 'util'
import MonoidData from './MonoidData'
import { AtomRef } from './atoms'

export type Emit<P = any> =
		readonly [Id, P] | AtomEmit<Data>

export type DataLoader<P> = (ids: Set<Id>) => Promise<Map<Id, [Head<Data>, P?]>>
export type MachineLoader<P> = (id: Id) => Promise<[Head<Data>, P]>

export class MachineSpace<W extends PhaseMap = {}, X extends MachineContext = MachineContext, P = Phase<W>> {
  private readonly world: WorldImpl<W, X>
  private readonly loader: MachineLoader<P>
  private readonly mediator: Mediator
  private readonly dispatch: Dispatch<X, P>

  private machines: Map<Id, Promise<Machine<X, P>>>
  private _machine$: Subject<Machine<X, P>>
  readonly machine$: Observable<Machine<X, P>>

  private _signal$: Observable<Signal>

  constructor(world: WorldImpl<W, X>, loader: MachineLoader<P>, dispatch: Dispatch<X, P>, mediator: Mediator, signal$: Observable<Signal>) {
    this.world = world;
    this.loader = loader;
    this.dispatch = dispatch;
    this.mediator = mediator;

    this.machines = Map();
    this._machine$ = new Subject();
    this.machine$ = this._machine$;

    this._signal$ = signal$;
    signal$.subscribe(s => {
      if(s.stop) this._machine$.complete();
    })
  }

  summon(ids: Set<Id>): Observable<Machine<X, P>> {
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
              id,
              this.asSpace(),
							this.dispatch,
							this.world.contextFac,
						  h => new Commit<Data>(new MonoidData(), h),
              this._signal$
						);

            this._machine$.next(machine);

            machine.begin(head, phase);

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
      ([,, loading]) => from(loading)
    )));
  }

  private asSpace(): ISpace {
    const _this = this;
    return {
      watch(ids: Id[]): Observable<AtomRef<Data>> {
        //this doesn't seem right - where's the merging of atoms?
        //!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        return _this.summon(Set(ids))
          .pipe(
            mergeMap(m => m.head$),
            mergeMap(h => h.refs())
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

export type Signal = {
  stop: boolean
}

export class Machine<X, P> {
  private _log$: Subject<Emit<P>>
  // private _atom$: Subject<AtomRef<Data>>
  private _head$: Subject<Head<Data>>
  private space: ISpace
  private dispatch: Dispatch<X, P>
  private modContext: (x: MachineContext) => X
	private commitFac: CommitFac
  private signal$: Observable<Signal>

  readonly id: Id
  readonly log$: Observable<Emit<P>>
  // readonly atom$: Observable<AtomRef<Data>>
  readonly head$: Observable<Head<Data>>
  
  constructor(
    id: Id,
    space: ISpace,
    dispatch: Dispatch<X, P>,
    modContext: (x: MachineContext) => X,
    commitFac: CommitFac,
    signal$: Observable<Signal>)
  {
    this.id = id;
    
    this._log$ = new ReplaySubject(1);
    this.log$ = this._log$;

    // this._atom$ = new ReplaySubject(1);
    // this.atom$ = this._atom$;

    this._head$ = new ReplaySubject(1);
    this.head$ = this._head$;

    this.space = space;
    this.dispatch = dispatch;
    this.modContext = modContext;
		this.commitFac = commitFac;

    this.signal$ = signal$;
  }

  begin(head: Head<Data>, phase: P) {
    const id = this.id;
    const log$ = this._log$;
    // const atom$ = this._atom$;
    const head$ = this._head$;
    const dispatch = this.dispatch.bind(this);
    const buildContext = this.buildContext.bind(this);
    const signal = new BehaviorSubject<Signal>({ stop: false })
    const signalSub = this.signal$.subscribe(signal);

    // head.refs().forEach(r => atom$.next(r));
    //AND NOW! special root atom should be marked as already-persisted, otherwise will incur unnecessary overwrite

    head$.next(head);

    setImmediate(() => (async () => {     
      
        while(!signal.getValue().stop) {
          log$.next([id, phase]);

          const committer = this.commitFac(head);
          const context = buildContext(id, committer);
          const out = await dispatch(context)(phase);

          if(out) {
            // let atom: AtomRef<Data>;
            [head] = await committer.complete(Map({ [id]: out }));
            // atom$.next(atom);
            head$.next(head);
            phase = out;
          }
          else {
            break;
          }
        }
      })()
      .catch(log$.error.bind(log$))
      .finally(() => {
        signalSub.unsubscribe();
        // atom$.complete();
        head$.complete();
        log$.complete();
      }));
  }

	private static $Internal = Symbol('CommitCtx')
  
  private buildContext(id: Id, commit: Commit<Data>): X {
    const me = this;
    const space = this.space;;

    return this.modContext({
      id: id,
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

import { Id, Data, WorldImpl, PhaseMap, Phase, MachineContext, ContextImpl } from './lib'
import { Mediator, Convener, Attendee, Peer } from './Mediator'
import { Observable, Subject, from, merge, of, ReplaySubject } from 'rxjs'
import { toArray, map, mergeMap, tap, filter, flatMap, expand, takeUntil, takeWhile, finalize, startWith, shareReplay, share } from 'rxjs/operators'
import Committer, { AtomEmit } from './Committer'
import { Map, Set, List } from 'immutable'
import { Dispatch } from './dispatch'
import { isArray } from 'util'
import MonoidData from './MonoidData'
import { AtomRef } from './atoms'
import Head from './Head'
import { Weight, Commit } from './AtomSpace'
const log = console.log;

export type Emit<P = any> =
		readonly [Id, P] | AtomEmit<Data>
  
export type Loader<P> = (ids: Set<Id>) => Promise<Map<Id, P>>

export class MachineSpace<W extends PhaseMap, X, P = Phase<W>> {
  private readonly world: WorldImpl<W, X> & ContextImpl<X>
  private readonly loader: Loader<P>
  private readonly mediator: Mediator
  private readonly dispatch: Dispatch<X, P>

  private readonly _commit$ = new ReplaySubject<Commit<Data>>(1)
  readonly commit$ = this._commit$;

  private machines: Map<Id, Promise<Machine<P>>>
  private _machine$: Subject<Machine<P>>
  readonly machine$: Observable<Machine<P>>

  private _signal$: Observable<Signal>

  private readonly MD = new MonoidData();

  constructor(
    world: WorldImpl<W, X> & ContextImpl<X>,
    loader: Loader<P>,
    dispatch: Dispatch<X, P>,
    mediator: Mediator,
    signal$: Observable<Signal>
  ) {
    this.world = world;
    this.loader = loader;
    this.dispatch = dispatch;
    this.mediator = mediator;

    this.machines = Map();
    this._machine$ = new Subject();
    this.machine$ = this._machine$;

    this._signal$ = signal$;
    signal$.pipe(filter(s => s.stop))
      .subscribe(() => {
        this._machine$.complete();
        this._commit$.complete();
      });
  }

  summon(ids: Set<Id>): Observable<Machine<P>> {
    const summoned = ids.map(id => {
      const found = this.machines.get(id);
      if(found) {
        return [false, id, found] as const;
      }
      else {
        const loading = this.loader(Set([id]));

        return [
          true,
          id,
          loading.then(loaded => {
            const phase = loaded.get(id)!;
            
            const machine = runMachine(
              id,
              phase,
              new Head(this._commit$, List()),
              h => new Committer<Data>(this.MD, h),
              this.asSpace(),
              this.dispatch,
              this.world.contextFac,
              this._signal$);

            this._machine$.next(machine);

            return machine;
          })
        ] as const;
      }
    })

    const toAdd = summoned
      .filter(([isNew]) => isNew)
      .map(([, id, loading]) => <[Id, Promise<Machine<P>>]>[id, loading]);
    
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
          .pipe(flatMap(m => m.head.atom$));
      },

      async attach<R>(me: any, attend: Attendee<R>): Promise<false|[R]> {
        return _this.mediator.attach(me, attend);
      },

      async convene<R>(ids: Id[], convene: Convener<R>): Promise<R> {
        const m$ = _this.summon(Set(ids));
        const ms = await m$.pipe(toArray()).toPromise(); //summoning should be cancellable (from loader?)
        
        const result = await _this.mediator
          .convene(convene, Set(ms));

        return result;
      }
    }
  }
}

interface ISpace {
  watch(ids: Id[]): Observable<AtomRef<Data>>
  attach<R>(me: any, attend: Attendee<R>): Promise<false|[R]>
  convene<R>(ids: Id[], convene: Convener<R>): Promise<R>
}

type CommitFac = (h: Head<Data>) => Committer<Data>

export type Signal = {
  stop: boolean
}

const $Ahoy = Symbol('$Ahoy')

export type Machine<P> = {
  id: Id,
  head: Head<Data>,
  log$: Observable<Emit<P>>
}

function runMachine<X, P>(
  id: Id,
  phase: P,
  head: Head<Data>,
  commitFac: CommitFac,
  space: ISpace,
  dispatch: Dispatch<X, P>,
  modContext: (x: MachineContext) => X,
  signal$: Observable<Signal>
): Machine<P>
{
  const kill$ = signal$.pipe(filter(s => s.stop), share());

  const log$ = of(phase).pipe(
    expand(async p => {
      if(p) {
        const committer = commitFac(head);

        try {
          const x = buildContext(id, committer);

          const out = await dispatch(x)(p);

          if(out) {
            await committer.complete(Map({ [id]: out }));
          }

          return out;
        }
        catch(e) {
          console.log('ERROR', e)
          committer.abort();
          throw e;
        }
      }
    }),
    takeWhile(o => !!o),
    startWith(phase),
    takeUntil(kill$),
    shareReplay(1),
    finalize(() => head.release()),
    map(o => [id, <P>o] as const),
  );

  const machine = {
    id,
    head,
    log$
  };

  return machine;


  function buildContext(id: Id, commit: Committer<Data>): X {
    return modContext({
      id: id,
      watch(ids: Id[]): Observable<Data> {
        return space.watch(ids)
          .pipe(
            tap(r => commit.add(List([r]))), //gathering all watched atomrefs here into mutable Commit
            mergeMap(r => r.resolve()), //empty refs get gathered too of course (to test for)
            map(a => a.val)
            //todo filter on passed ids
          );
      },
      attach<R>(attend: Attendee<R>) {
        return space.attach(machine, {
					chat(m, peers) {
						if(isArray(m) && m[0] == $Ahoy) {
							Committer.combine(new MonoidData(), [commit, <Committer<Data>>m[1]]);
							m = m[2];
						}

						const proxied = peers.map(p => <Peer>({
							chat(m) {
								return p.chat([$Ahoy, commit, m]);
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
								return p.chat([$Ahoy, commit, m]);
							}
						}));
						return convene.convene(proxied);
					}
				});
      }
    });
  }
}

import { Id, Data, World, WorldImpl, PhaseMap, Phase, _Phase, MachineContext } from './lib'
import { Head } from './AtomSpace'
import { Mediator, Convener, Attendee, Peer } from './Mediator'
import { Observable, Subject, from, merge } from 'rxjs'
import { flatMap, skipWhile, startWith, mergeAll, endWith, scan, takeWhile, finalize, publish, toArray } from 'rxjs/operators'
import Committer, { Commit } from './Committer'
import { Map, Set } from 'immutable'
import { Dispatch } from './dispatch'
import { isArray } from 'util'
import MonoidData from './MonoidData'
import { gather } from './helpers'

export type Emit<P = any> =
		readonly [Id, P] | Commit<Data>

export class Run<W extends World, P = Phase<W>> {
  private readonly space: MachineSpace<W, PhaseMap, P>
  private readonly mediator: Mediator
  private readonly log$$: Subject<Observable<Emit<P>>>

  log$: Observable<Emit<P>>

  constructor(space: MachineSpace<W, PhaseMap, P, any>, mediator: Mediator) {
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


export type MachineLoader<P> = (ids: Set<Id>) => Promise<Map<Id, [Head<Data>, P?]>>

export class MachineSpace<W extends World = World, PM extends PhaseMap = W['phases'], P = _Phase<PM>, X = W['context']> {
  private readonly world: WorldImpl<W>
  private readonly loader: MachineLoader<P>
  private readonly mediator: Mediator
  private readonly dispatch: Dispatch<X, P>
  private readonly zeroPhase: P
  private machines: Map<Id, Promise<Machine<X, P>>>

  private log$$: Subject<Observable<Emit<P>>>
	private commit$: Subject<Commit<Data>>
  log$: Observable<Emit<P>>

  constructor(world: WorldImpl<W>, loader: MachineLoader<P>, dispatch: Dispatch<X, P>, zeroPhase: P) {
    this.world = world;
    this.loader = loader;
    this.dispatch = dispatch;
    this.zeroPhase = zeroPhase;
    this.mediator = new Mediator();
    this.machines = Map();

    this.log$$ = new Subject();
		this.commit$ = new Subject();
    this.log$ = merge(
			this.commit$,
			this.log$$.pipe(mergeAll())
		);
  }

	complete() {
		this.commit$.complete();
		this.log$$.complete();
	}

  newRun(): Run<W, P> {
    return new Run(this, this.mediator);
  }

  summon(ids: Set<Id>): Observable<IMachine<P>> {
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
          loading.then(([[,[head, phase]]]) => {
            const machine: Machine<X, P> = new Machine<X, P>(
							this.dispatch,
							() => this.buildContext(machine),
							this.world.contextFac,
						  h => new Committer<Data>(new MonoidData(), h, this.commit$)
						);

            this.log$$.next(machine.log$);

            machine.begin(id, head, phase || this.zeroPhase);

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

  private buildContext(m: Machine<X, P>): MachineContext {
    const _this = this;
    return {
      async attach<R>(attend: Attendee<R>): Promise<false|[R]> {
        return _this.mediator.attach(m, attend);
      },

      async convene<R>(ids: Id[], convene: Convener<R>): Promise<R> {
        const machine$ = _this.summon(Set(ids));
        return await _this.mediator
          .convene(convene, Set(await gather(machine$)));
      }
    }
  }
}

type CommitterFac = (h: Head<Data>) => Committer<Data>


export class Machine<X, P> implements IMachine<P> {
  private _log$: Subject<Emit<P>>
  private dispatch: Dispatch<X, P>
  private getRootContext: () => MachineContext
  private decorateContext: (x: MachineContext) => X
	private committerFac: CommitterFac

  log$: Observable<Emit<P>>
  
  constructor(dispatch: Dispatch<X, P>, getRootContext: () => MachineContext, finishContext: (x: MachineContext) => X, committerFac: CommitterFac) {
    this._log$ = new Subject<Emit<P>>();
    this.log$ = this._log$;

    this.dispatch = dispatch;
    this.getRootContext = getRootContext;
    this.decorateContext = finishContext;
		this.committerFac = committerFac;
  }

  begin(id: Id, head: Head<Data>, phase: P) {
    const log$ = this._log$;
    const dispatch = this.dispatch.bind(this);
    const buildContext = this.buildContext.bind(this);
    const getRootContext = this.getRootContext.bind(this);

    setImmediate(() => (async () => {     
        while(true) {
          log$.next([id, phase]);

          const committer = this.committerFac(head);
          const context = buildContext(getRootContext(), committer);
          const out = await dispatch(context)(phase);

          if(out) {
            await committer.complete(Map({ [id]: out }));
            phase = out;
          }
          else {
            break;
          }
        }
      })()
      .catch(log$.error.bind(log$))
      .finally(log$.complete.bind(log$)));
  }

	//TODO
	//do peer chat etc as middleware layers
	//... 

	private static $Internal = Symbol('CommitCtx')
  
  private buildContext(inner: MachineContext, commitCtx: Committer<Data>): X {
		const context: MachineContext = {
      attach<R>(attend: Attendee<R>) {
        return inner.attach({
					chat(m, peers) {
						if(isArray(m) && m[0] == Machine.$Internal) {
							Committer.combine(new MonoidData(), [commitCtx, <Committer<Data>>m[1]]);
							m = m[2];
						}

						const proxied = peers.map(p => <Peer>({
							chat(m) {
								return p.chat([Machine.$Internal, commitCtx, m]);
							}
						}));
						return attend.chat(m, proxied);
					}
				});
      },
      convene<R>(ids: Id[], convene: Convener<R>) {
        return inner.convene(ids, {
					convene(peers) {
						const proxied = peers.map(p => <Peer>({
							chat(m) {
								return p.chat([Machine.$Internal, commitCtx, m]);
							}
						}));
						return convene.convene(proxied);
					}
				});
      }
    };
		
    return this.decorateContext(context);
  }
}


interface IMachine<P> {
  readonly log$: Observable<Emit<P>>
}

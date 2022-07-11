import { Id, Data, WorldImpl, PhaseMap, Phase, ContextImpl, MachineContext } from './lib'
import { Mediator, Convener, Attendee } from './Mediator'
import { Observable, Subject, from, merge, ReplaySubject, GroupedObservable } from 'rxjs'
import { toArray, filter, flatMap, map } from 'rxjs/operators'
import Committer from './Committer'
import { Map, Set } from 'immutable'
import { Dispatch } from './dispatch'
import MonoidData from './MonoidData'
import Head from './Head'
import { Commit } from './AtomSpace'
import { Log, Machine, runMachine } from './runMachine'
const log = console.log;

export type Emit<P = any> = readonly [Id, P]
  
export type Loader<P> = (ids: Set<Id>) => Promise<Map<Id, P>>

export class MachineSpace<W extends PhaseMap, P = Phase<W>, X extends MachineContext<P> = MachineContext<P>> {
  private readonly world: WorldImpl<W, X> & ContextImpl<P, X>
  private readonly loader: Loader<P>
  private readonly mediator: Mediator
  private readonly dispatch: Dispatch<P, X>

  private readonly _commit$ = new ReplaySubject<Commit<Data>>(1)
  readonly commit$ = this._commit$;

  private machines: Map<Id, Promise<Machine<P>>>
  private _machine$: Subject<Machine<P>>
  readonly machine$: Observable<Machine<P>>

  private _signal$: Observable<Signal>

  private readonly MD = new MonoidData();

  constructor(
    world: WorldImpl<W, X> & ContextImpl<P, X>,
    loader: Loader<P>,
    dispatch: Dispatch<P, X>,
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

        //TODO should check loaded phases against schema guards!

        return [
          true,
          id,
          loading.then(loaded => {
            const phase = loaded.get(id)!;
            
            const machine = runMachine(
              id,
              phase,
              new Head(this._commit$),
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

  private asSpace(): ISpace<P> {
    const _this = this;
    return {
      watch(ids: Id[]): Observable<[Id, Log<P>]> {
        return _this.summon(Set(ids)).pipe(
          flatMap(m => m.log$.pipe(
            map(l => <[Id, Log<P>]>[m.id, l])
          )));
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

export interface ISpace<P> {
  watch(ids: Id[]): Observable<[Id, Log<P>]>
  attach<R>(me: any, attend: Attendee<R>): Promise<false|[R]>
  convene<R>(ids: Id[], convene: Convener<R>): Promise<R>
}

export type Signal = {
  stop: boolean
}



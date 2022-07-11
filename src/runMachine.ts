import { Id, Data } from './lib'
import { Convener, Attendee, Peer } from './Mediator'
import { Observable, from, of, EMPTY } from 'rxjs'
import { tap, filter, expand, takeUntil, finalize, startWith, shareReplay, share, flatMap } from 'rxjs/operators'
import Committer from './Committer'
import { Map, List } from 'immutable'
import { isArray } from 'util'
import MonoidData from './MonoidData'
import { AtomRef } from './atoms'
import Head from './Head'
import { ISpace, Signal } from './MachineSpace'
import { BuiltWorld } from './shape/BuiltWorld'

const $Ahoy = Symbol('$Ahoy')

export type Machine = {
  id: Id,
  head: Head<Data>,
  log$: Observable<Log>
}

export type CommitFac = (h: Head<Data>) => Committer<Data>

export type Log = [unknown, AtomRef<Data>?]

export function runMachine(
  id: Id,
  state: unknown,
  head: Head<Data>,
  commitFac: CommitFac,
  space: ISpace,
  world: BuiltWorld,
  signal$: Observable<Signal>
): Machine
{
  const kill$ = signal$.pipe(filter(s => s.stop), share());

  const log$ = of(<Log>[state]).pipe(
    expand(([p]) => {
      if(!p) return EMPTY;

      return from((async () => {
        const committer = commitFac(head);

        try {
          //read path out of phase here
          const { guard, fac, handler } = world.read('');

          if(!handler) throw Error();
          if(!fac) throw Error();
          if(!guard) throw Error();

          //guard here
          //...

          const coreCtx = coreContext(id, committer);
          const ctx = fac(coreCtx);
          const out = await handler(ctx, p);

          if(out) {
            const ref = await committer.complete(Map({ [id]: out }));
            return <Log>[out, ref];
          }

          return <Log>[out];
        }
        catch(e) {
          console.error(e);
          committer.abort();
          throw e;
        }
      })())
    }),
    startWith(<Log>[state, new AtomRef()]),
    filter((l) => !!l[0]),
    takeUntil(kill$),
    finalize(() => head.release()),
    shareReplay(1),
  );

  const machine = {
    id,
    head,
    log$
  };

  return machine;


  function coreContext(id: Id, commit: Committer<Data>): unknown {
    return {
      id: id,

      watch(ids: Id[]): Observable<[Id, unknown]> {
        return space.watch(ids)                //TODO if the same thing is watched twice, commits will be added doubly
          .pipe(
            tap(([,[,r]]) => { //gathering all watched atomrefs here into mutable Commit
              if(r) commit.add(List([r]))
            }),
            flatMap(([id, [p]]) => p ? [<[Id, unknown]>[id, p]] : []),
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
    };
  }
}

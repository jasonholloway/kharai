import { Id, Data, MachineContext } from './lib'
import { Convener, Attendee, Peer } from './Mediator'
import { Observable, from, of, EMPTY } from 'rxjs'
import { map, tap, filter, expand, takeUntil, finalize, startWith, shareReplay, share, takeWhile, flatMap } from 'rxjs/operators'
import Committer from './Committer'
import { Map, List } from 'immutable'
import { Dispatch } from './dispatch'
import { isArray } from 'util'
import MonoidData from './MonoidData'
import { AtomRef } from './atoms'
import Head from './Head'
import { ISpace, Signal } from './MachineSpace'
const log = console.log;

const $Ahoy = Symbol('$Ahoy')

export type Machine<P> = {
  id: Id,
  head: Head<Data>,
  log$: Observable<Log<P>>
}

export type CommitFac = (h: Head<Data>) => Committer<Data>

export type Log<P> = [P, AtomRef<Data>?]

export function runMachine<X, P>(
  id: Id,
  phase: P,
  head: Head<Data>,
  commitFac: CommitFac,
  space: ISpace<P>,
  dispatch: Dispatch<X, P>,
  modContext: (x: MachineContext<P>) => X,
  signal$: Observable<Signal>
): Machine<P>
{
  type L = Log<P|false>
  
  const kill$ = signal$.pipe(filter(s => s.stop), share());

  const log$ = of(<L>[phase]).pipe(
    expand(([p]) => {
      if(!p) return EMPTY;

      return from((async () => {
        const committer = commitFac(head);

        try {
          const x = buildContext(id, committer);

          const out = await dispatch(x)(p);

          if(out) {
            const ref = await committer.complete(Map({ [id]: out }));
            return <L>[out, ref];
          }

          return <L>[out];
        }
        catch(e) {
          console.error(e);
          committer.abort();
          throw e;
        }
      })())
    }),
    startWith(<L>[phase, new AtomRef()]),
    filter((l): l is Log<P> => !!l[0]),
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


  function buildContext(id: Id, commit: Committer<Data>): X {
    return modContext({
      id: id,
      watch(ids: Id[]): Observable<[Id, P]> {
        return space.watch(ids)                //TODO if the same thing is watched twice, commits will be added doubly
          .pipe(
            tap(([,[,r]]) => { //gathering all watched atomrefs here into mutable Commit
              if(r) commit.add(List([r]))
            }),
            flatMap(([id, [p]]) => p ? [<[Id, P]>[id, p]] : []),
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

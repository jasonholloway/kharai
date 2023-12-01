import { Id, DataMap } from './lib'
import { ReplaySubject, of, concat, Subject, merge } from 'rxjs'
import { tap, startWith, endWith, scan, takeWhile, finalize, map, ignoreElements, concatMap, filter, shareReplay, mergeMap, take } from 'rxjs/operators'
import { Set } from 'immutable'
import { ConvenedFn, Convener, Frisked, MachineSpace, Signal } from './MachineSpace'
import { Lump, runSaver } from './AtomSpace'
import MonoidData from './MonoidData'
import { Saver, Loader } from './Store'
import { BuiltWorld } from './shape/BuiltWorld'
import { RealTimer } from './Timer'
import { RunSpace } from './RunSpace'
import * as NodeTree from './shape/NodeTree'
import * as RelPaths from './shape/RelPaths'
import * as PhaseHelper from './shape/PhaseHelper'

const MD = new MonoidData();

export type RunOpts = {
  threshold?: number,
  save?: boolean
};

const dummySaver: Saver<DataMap> = {
  prepare() {
    return {
      save: () => Promise.resolve()
    }
  }
};

export function newRun<N,O>
(
  world: BuiltWorld<N,O>,
  loader: Loader,
  saver: Saver<DataMap>,
  opts?: RunOpts
) {
  if(opts?.save === false) saver = dummySaver;

  const signal$ = new ReplaySubject<Signal>(1);
  const kill$ = signal$.pipe(filter(s => s.stop), take(1), shareReplay(1));
  const complete = () => signal$.next({ stop: true });

  const lump$ = new ReplaySubject<Lump<DataMap>>(100); //could be better wired up this

  const runSpace = new RunSpace<DataMap,Frisked[]>(MD, new RealTimer(kill$), signal$, lump$);
  const machineSpace = new MachineSpace(world, loader, runSpace, signal$);

  const { machine$ } = machineSpace;

  const log$ = machine$.pipe(
    mergeMap(m => m.log$.pipe(
      map(l => [m.id, l] as const)
    )));

  const threshold$ = concat(
    of(opts?.threshold ?? 3),
    log$.pipe(
      ignoreElements(),
      endWith(0),
    )
  ).pipe(
    tap(t => console.log('THRESH', t)),
    shareReplay(1)
  );

  if(opts?.save !== false) {
    runSaver(MD, lump$, threshold$)
      .pipe(concatMap(fn => fn(saver)))
      .subscribe();
  }
  else {
    lump$.subscribe();
  }


  const keepAlive$ = new Subject<number>();

  merge(
    machine$.pipe(
      mergeMap(m => m.log$.pipe(
        ignoreElements(),
        startWith<number>(1),
        endWith<number>(-1),
      ))),
    keepAlive$
  ).pipe(
    scan((c, n) => c + n, 0),
    takeWhile(c => c > 0),
    finalize(complete)
  ).subscribe()

  return {
    machine$,
    log$,
    complete,

    runSpace,
    machineSpace,

    and: <PhaseHelper.Form<RelPaths.Form<NodeTree.Form<N>,[]>,O>><unknown>{},

    async session(fn: ()=>Promise<void>) {
      const release = this.keepAlive();
      try {
        await fn();
      }
      finally {
        release();
        this.complete();
      }
    },

    async summon(ids: Id[]) {
      const machines = machineSpace.summon(Set(ids));

      return {
        meet<R = unknown>(convener: Convener<R>|ConvenedFn<R>): Promise<R> {
          //below rubbishly resummons
          return machineSpace.runArbitrary(x => {
            return x.convene(ids, convener).ok();
          });
        },

        tell(m: unknown) {
          return this.meet(async ([p]) => p.chat(m));
        },

        log$: of(...machines).pipe(
          mergeMap(m => m.log$)),

        api<A>(api:A) {
        }
      }
    },

    async boot(id: Id, next: O): Promise<boolean> {
      const ms = await this.summon([id]);
      const result = await ms.tell(next);
      return result && !!result[0];
    },

    keepAlive(): (()=>void) {
      keepAlive$.next(1);
      return () => {
        keepAlive$.next(-1);
      };
    }
  };
}






// the idea of the top-level orchestration being a RunSpace run is a good one
// but it tangles us up in locks!
// well, actually, no it doesn't...
// 
// although, maybe it should. If we interact with one machine, take info from its course
// and then interact with another based on this info
// there's a clear dependency there, despite no saving ever happening on our side of the orchestration
// in fact, there's clear side-effecting on our side of proceedings
// it's just that it's unmanged by the system
//
// links of causation are untrackable
// each interaction has a context, that might unite in sausage fashion many interactions
// in the ways of the system, these would be represented by a string of dependent atoms
//
// this makes me think now that we, the interactive user, should in fact have our own commits
// it's just these commits won't be saved
//
// they will belong in the atom tree though, as empty, weightless atoms
//
// this idea is a good one
// but it problematises our original instinct to use these runs to keep things implicitly alive
// both machines and orchestrations are the same kind of thing:
// they are flows of action
// and as long as there is such a flow about,
// the system should continue whirring
//
// however, imagine a machine looping on a timer - it will never cease looping
// there always therefore has to be a way of intervening
//
// keeping a flow around will keep things alive
// but we need a way of killing waits and conversations
// and also signalling to user code cooperatively
//
// -----------------------------------------------
//
// The thought that commits belong to flows as much as machines
// makes me think of the placement of MachineSpaceContext
// its attendings and watches and *commits* belong as much to flows
// though none of these can be targeted at anything but a machine
//
// could commits at least be shunted down to the common RunSpace?
// all interactions involve commits for each party
// this means every attend should pass through a commit,
// as should every convene
//
// watches however are purely to do with machines
// although, a flow of commits would still be produced by an interaction flow
// though this flow wouldn't be tracked
//
// we could then use RunSpace directly for one-off runs, supplying to it our contextual commit
// for causation-tracking purposes
// the issue here is that we *do* want to interact with machines normally
// eg we do want to watch them
// a direct use of the RunSpace would not give us this
//
// so we'd still have to go via the MachineSpace, as we truly do want to be inside the MachineSpace.
// this is unavoidable
// however, moving the commit mechanism into the RunSpace does factor the code and simplify the otherwise overburdened MachineSpace
//
// though, even with moving commit-joining into RunSpace, watch could not follow
// 
// ---------------------------------------------------
//
// the system could be kept alive by above
// if the count of activity was of flows rather than of machines
// sounds like a FlowSpace then(!)
// each flow would take to itself a handle
// which would also come with an observable canceller
// and a Head?
//
// the FlowSpace attends to the common needs of Machine and manual interaction
// and thereby simplifies the job of the MachineSpace
// but still the manual interaction, to use the resources of the MachineSpace
// has to go via it. The MachineSpace can however use the RunSpace to merge commits on interaction
// and on the FlowSpace to provide handles etc
//
// ----------------------------------------------------
//
// Wait a second... 
// the RunSpace already provides Runs, straddling multiple invocations
// what is this but the Flow as mentioned above?
// makes me think that Flow is a better name for it though
//
// if the RunSpace *is* the FlowSpace, then it itself can track counts
// and also supply heads and commits per Run
// every attend/convene would then be done by a Run with a head
//
// but again in our interactions, we can't use the FlowSpace below directly
// we have to go via the MachineSpace layer
//
// but we're back at the two-layer system
// more and more stuff can go into the layer below
// but even watch could be per Run
//
// if you have a reference to a Run, you can follow its commits
// (but not its state?) but commits are exactly its state
// so the Flowpace/RunSpace does a fair whack of what the MachineSpace is doing
//
// the MachineSpace adds some higher functionalities and generally nicifies
// it matches Ids to Runs
// and knows something about states 
//
// if Flows know nothings of ids and states, how can they commit?
// it's fine: Flows know of Atoms, Heads and Lumps - this is enough
// to support both machines and interactions
//
// -----------------------------------------------
//
// the individual Flow has no output
// though the space as a whole does output commit$
//
// how can the Flow be watched then???
// before I was imagining a per-Flow view of passing states
// (basically the things that are passed into commits)
// if you have a ref to the Flow, then you can view what it is
// emitting
//
// a Machine is then not much more than a Flow and some logic around providing behaviours
//
//

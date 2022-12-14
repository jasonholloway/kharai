import { Extend, Simplify } from "../util";
import * as TreeCtx from './TreeCtx'
import * as RelPaths from './RelPaths'
import * as PhaseHelper from './PhaseHelper'
import * as RefHelper from './RefHelper'
import * as NodeTree from './NodeTree'
import { PreExpand } from "../guards/Guard";
import { $self } from "../shapeShared";
import { RunCtx } from "../RunSpace";
import { DataMap, Id, PhaseData } from "../lib";
import { AttendedFn, Attendee, ConvenedFn, Convener, Frisked } from "../MachineSpace";
import { Observable } from "rxjs";
import CancellablePromise from "../CancellablePromise";

export type Ctx<N,PL extends string[],O> =
  RunCtx<DataMap,Frisked[]> extends infer XA ?
  MachineSpaceCtx extends infer XB ?
  (
    PL extends ['M',...unknown[]] ? (
      Extend<
        MachineCtx,
        PathCtx<N,PL,O>
        >
    ) :
    PL extends ['C',...unknown[]] ? (
        PathCtx<N,[],O>
    ) : unknown
  ) extends infer XC ?
  TreeCtx.Form<N,PL> extends infer XD ?
  Simplify<Extend<Extend<Extend<XA,XB>,XC>,XD>>
  : never : never : never : never
;

type PathCtx<N,PL extends string[],O> = 
  RelPaths.Form<N,PL> extends infer RT ?
  {
    and: PhaseHelper.Form<RT,O>,
    ref: RefHelper.Form<RT>,
    expandType: <T>(t:T)=>PreExpand<T,typeof $self,O>
  }
  : never
;

export type MachineCtx =
  {
    id: Id
    isFresh: () => boolean
  }
;

export type MachineSpaceCtx =
  {
    attend: <R>(attend: Attendee<R>|AttendedFn<R>) => Promise<false|[R]>
    convene: <R>(ids: string[], convene: Convener<R>|ConvenedFn<R>) => Promise<R>
    watch: (id: Id) => Observable<unknown>
    watchRaw: (id: Id) => Observable<PhaseData>

    meet: (id: Id) => CancellablePromise<MetPeer>
  }
;

export type MetPeer =
  {
    chat: (m: unknown) => unknown;
  }
;

try {
  type W = {
    X: {a:1}
    X_M: {b:2}
    X_M_blah: {c:3}
  }

  type A = NodeTree.Form<W>;
  type B = Ctx<A,[],0>
  type C = Ctx<A,['M','blah'],0>
  type D = Ctx<A,['C'],0>

  const d = <D><unknown>0;

  type _ = [A,B,C,D]
} catch {}


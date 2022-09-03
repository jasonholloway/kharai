import { List, OrderedMap } from "immutable";
import { Observable } from "rxjs/internal/Observable";
import { inspect, isArray } from "util";
import { Any, Guard, Many, Never, Num, Str, Read } from "../guards/Guard";
import { Id } from "../lib";
import { AttendedFn, Attendee, ConvenedFn, Convener, Peer } from "../MachineSpace";
import { Handler, $data, $Data, $Fac, $Root, $root, $Incl, $incl } from "../shapeShared";
import { Timer } from "../Timer";
import { DeepMerge, DeepSimplify, delay, IsAny, IsNever, Merge, Simplify } from "../util";
import { BuiltWorld } from "./BuiltWorld";
import { act, ctx, Data, FacContext, FacPath, formPath, Impls, incl, isDataNode, isInclNode, PathFac, SchemaNode } from "./common";
import { mergeNodeVal, NodeVal, NodeView, Registry } from "./Registry";

export const separator = '_'
export type Separator = typeof separator;

export module Builder {

  export type TryMerge<A, B> =
    Builder<
      Merge<A,_MergeNew<A,B>>
    >;

  //so below is a problem
  //in that the nice Ts are getting stuck, blocked in the type-deduction pipeline
  //
  //
  //

  type _MergeNew<A,B> = {
    [k in keyof B]:
      k extends `D${'_'|''}${string}` ? (
        //data must be invariantly equal
        k extends keyof A ?
          A[k] extends B[k] ?
          B[k] extends A[k] ?
          B[k]
          : never : never
        : B[k]
        //need to pool errors somehow
      )
    : k extends `XA${'_'|''}${string}` ? (
        //contracts should merge nicely
        k extends keyof A ?
        DeepMerge<A[k], B[k]> //tried MergeDeep here but it's naff (currently)
        : B[k]
      )
    : k extends `XI${'_'|''}${string}` ? (
        //implementations should merge nicely
        k extends keyof A ?
        DeepMerge<A[k], B[k]>
        : B[k]

      //this is a shallow merge only of facs
      //and moreso it allows simple shadowing of props
      //this will then put XAs and XIs out of whack, which should be caught
      )
    : never

    //how to pack error here?
    //can only pack encoding into mapped props
    //and extract in one swoop after
  };

  //merging facs, what's the point?
  //we want to extend facs - simple enough
  //so just merge types where we have overlap?
  //
  //but... this doesn't help us extend them fluently...
  //



  export type TryBuild<N> =
    [_FindUnimplementedFacs<N, keyof N>] extends [infer Results] ?
    [Results] extends [[]]
      ? BuiltWorld<N>
      : ['Unimplemented facs found', Results]
    : never;

  type _FindUnimplementedFacs<N,X> =
    X extends keyof N ?
    X extends `XA${infer Rest}` ? 
    `XI${Rest}` extends infer XI ?
    `fac '${Rest}' needs` extends infer Part0 ?
    XI extends keyof N ?
    N[XI] extends N[X] ? never
    : [Part0, N[X], 'but given:', N[XI]]
    : [Part0, N[X], 'but not given']
  : never : never : never : never;


  export type MergeFacImpl<N, P extends string, X> =
    Merge<N,
      {
        [k in _JoinPaths<'XI', P>]:
          k extends keyof N ?
          Merge<N[k],X>
          : X
      }> extends infer Merged
    ? Builder<Merged>
    : never;


  export type AtPath<P extends string, N> =
    Builder<{
      [k in keyof N as
       k extends _JoinPaths<infer PH, infer PT>
        ? _JoinPaths<PH, _JoinPaths<P, PT>>
        : never
      ]: N[k]
    }>;
}

// {
//   type A = {
//     D: 444,
//     D_blah: 123,
//     XA: { a:1 },
//     XI: { a:1 },
//     XA_moo: { b:3 },
//     XI_moo: { b:3 },
//     // XA_chinchilla: {c: 9}
//   };

//   type H = Builder.TryBuild<A>

//   const w = world({
//     meeow: {
//       ...ctx<{a:1}>()
//     }
//   }).build();

//   const _ = w;
//   type _ = [A,H];
// }




export type PhaseHelper<N, Out> = _WalkData<'',_ExtractData<N>, Data<N>, Out>

type _ExtractData<N> = {
  [k in keyof N as (k extends _JoinPaths<'D', infer P> ? P : never)]: N[k]
};

type _WalkData<P extends string, D, DAll, Out> = DeepSimplify<
  (
    P extends keyof D
      ? _Handler<Read<D[P], $Root, Out>, Out>
      : unknown
  )
  & ({
    [N in _ExtractNextPrefixes<P,D> & string]: _WalkData<_JoinPaths<P,N>, D, DAll, Out>
  })
>;

type _Handler<V,Out> =
  IsNotNever<V> extends true
  ? ((d: V) => Out)
  : (() => Out);

type _ExtractNextPrefixes<P extends string, D> =
  keyof D extends infer K ?
  K extends _JoinPaths<P, _JoinPaths<infer N, any>> ?
  N
  : never : never;


try {
  type W = {
    D_: [1]
    D_hello_again: [typeof Num]
    D_hello_moo: [3]
    D_tara: [4]
    D_tara_moo: never
  };

  type A = _ExtractData<W>;
  type B = _ExtractNextPrefixes<'', A>
  type C = _ExtractNextPrefixes<'hello', A>
  type Z = _WalkData<'',A,'DAll','OUT'>

  const z = <Z><unknown>undefined;

  z.hello.again([2]);
  z.tara([4]);
  z.tara.moo();

  type _ = [A,B,C,Z];
}
catch {}


const $unique = Symbol('');
interface AndNext {
  tag: typeof $unique
}


export class Builder<N> {
  public readonly nodes: N = <N><unknown>{}
  readonly reg: Registry
  
  constructor(reg?: Registry) {
    this.reg = reg ?? Registry.empty;
  }

  with<N2>(other:Builder<N2>): Builder.TryMerge<N, N2> {
    return <Builder.TryMerge<N,N2>><unknown>new Builder(this.reg.mergeWith(other.reg));
  }

  paths(): FacPath<N> {
    throw 'err';
  }

  ctxImpl<P extends FacPath<N>, X extends Partial<PathFac<N,P>>>(path: P, fn: (x: FacContext<N,P>)=>X) : Builder.MergeFacImpl<N,P,X> {
    const pl = path.split(separator);
    
    return <Builder.MergeFacImpl<N,P,X>>new Builder(
      this.reg.update(root => root
        .summon(pl, () => ({ facs: List() }))
        .update(v => ({
          ...v,
          facs: v.facs.push(fn)
        })))
    );
  }

  debug(): Builder<N> {
    this.reg.debug();
    return this;
  }

  shape<S extends SchemaNode>(s: S): Builder.TryMerge<N, Shape<S>> {
    const reg2 = this.reg.update(root => _walk(root, s))
    return <Builder.TryMerge<N,Shape<S>>><unknown>new Builder<Shape<S>>(reg2);


    function _walk(node: NodeView<NodeVal>, obj: SchemaNode): NodeView<NodeVal> {
      if(isDataNode(obj)) {
        const data = obj[$data];
        return node
          .update(v => ({
            ...v,
            guard: [data]
          }));
      }

      if(isInclNode(obj)) {
        const incl = obj[$incl];
        return node
          .mergeIn(mergeNodeVal, incl.reg.root);
      }

      if(typeof obj === 'object') {
        return Object
          .getOwnPropertyNames(obj)
          .reduce(
            (n, pn) => _walk(n.pushPath(pn, ()=>({facs:List()})), (<any>obj)[pn]).popPath()!,
            node
          );
      }

      throw Error('strange node')
    }
  }

  impl<S extends Impls<N,AndNext>>(s: S): Builder<N> {
    return new Builder<N>(this.reg.update(root => _walk(root, s)));

    function _walk(node: NodeView<NodeVal>, obj: object): NodeView<NodeVal> {
      return Object
        .getOwnPropertyNames(obj)
        .reduce(
          (n, pn) => {
            const prop = (<{[k:string]:unknown}>obj)[pn];

            switch(typeof prop) {
              case 'function':
                return n
                  .pushPath(pn, ()=>({facs:List()}))
                  .update(v => ({
                    ...v,
                    handler: (x:object, d:unknown) => {
                      return (<Handler>prop)(x, d);
                    }
                  }))
                  .popPath()!;

              case 'object':
                if(prop) return _walk(n.pushPath(pn, ()=>({facs:List()})), prop).popPath()!;
                break;
            }

            return n;
          },
          node
        );
    }
  }

  build(): Builder.TryBuild<N&BuiltIns> {
    const reg0 = this.reg.mergeWith(builtIns());

    const withRelPaths = reg0.root
      .mapDepthFirst<[NodeVal, List<List<string>>]>(
        (val, children) => {
          const r = children
            .map(([,ps], k) => {
              return List([List([k])]).concat(ps.map(pl => List([k]).concat(pl)));
            })
            .valueSeq()
            .flatMap(l => l)
            .toList();
          
          return [val, r];
        }
      );

    // console.debug(inspect(
    //   withRelPaths.show(v=> v[1].map(pl => pl.toArray()).map(formPath).toArray()),
    //   {depth:5}
    // ));

    const withAllPaths = withRelPaths
      .mapBreadthFirst<[NodeVal, List<[List<string>,List<string>]>]>(
        ([val,ps], ancestors, route) => {
          const ancestorPaths = ancestors
            .flatMap(([,ls]) => ls);

          const relPaths = ps.map(p => <[List<string>,List<string>]>[p, route.concat(p)]);
          const allPaths = ancestorPaths.concat(relPaths);

          return [val, allPaths];
        }
      );

    const withAnds = withAllPaths
      .mapDepthFirst<NodeVal>(([v, paths], _, pl) => {
        if(v.handler) {
          const pathMap = OrderedMap(paths.map(([al,zl]) => [al.join(separator), zl.join(separator)]));
          const and = _buildAnd(pathMap);
          return {
            ...v,
            handler: (x:object, d:unknown) => v.handler!({ ...x, and }, d)
          };
        }
        else {
          return v;
        }
      });

    const reg1 = new Registry(withAnds);

    return <Builder.TryBuild<N&BuiltIns>><unknown>new BuiltWorld(reg1);

    
    function _buildAnd(availPaths: OrderedMap<string,string>): object {
      const ac = {};

      for(const [pFrom,pTo] of availPaths) {
        _emplace(ac, pFrom.split(separator), pTo);
      }

      return ac;
    }

    function _emplace(o:{[k: string]: unknown}, pl:string[], pTo:string) {
      const [ph, ...pt] = pl;
      let o2 = <{[k:string]:unknown}>(o[ph] ?? {});

      if(pt.length > 0) {
        _emplace(o2, pt, pTo)
      }
      else if(ph) {
        o2 = Object.assign(
          ((d:unknown) => d !== undefined ? [pTo, d] : [pTo]),
          <{[k:string]:unknown}>{});
      }
      else {
        throw Error();
      }

      o[ph] = o2;
    }
  }
}


{
  type W = {
    XA: {}
    D_hello: typeof Num
  }

  type A = Builder.AtPath<'blah', W>;

  type _ = [A];
}



export type BuiltIns = {
  XA: CoreCtx //todo these could be collapsed into simple, single 'X' entry
  XI: CoreCtx
  D_boot: never,
  D_end: typeof Any,
  D_wait: [typeof Num | typeof Str, $Root],


  //BELOW NEED TO BE ABLE TO DO ANDS IN GUARDS!
  D_$meetAt: [typeof Str, $Root],

  D_$m_place: never,
  D_$m_gather: [typeof Num, typeof Str[]], //[version, ids]
  D_$m_mediate: [typeof Num, typeof Str, typeof Str[], typeof Str[]] //[version, key, ids, remnants]
};


function builtIns() {
  let reg = Registry.empty;

  reg = reg.update(n => n
    .update(v => ({
      ...v,
      facs: v.facs.push(x => x)
    })));

  reg = reg.update(n => n
    .pushPath('boot', ()=>({facs:List()}))
    .update(v => ({
      ...v,
      guard: [Any],
      async handler(x: CoreCtx) {
        while(true) {
          const answer = await x.attend({
            attended(m) {
              return [m];
            }
          });

          if(answer) {
            return answer[0];
          }
          else {
            await delay(30); //when we release properly, this can be removed (cryptic note!)
          }
        }
      }
    }))
    .popPath()!);

  reg = reg.update(n => n
    .pushPath('end', ()=>({facs:List()}))
    .update(v => ({
      ...v,
      guard: [Any],
      async handler() {
        return false;
      }
    }))
    .popPath()!);
  
  reg = reg.update(n => n
    .pushPath('wait', ()=>({facs:List()}))
    .update(v => ({
      ...v,
      guard: [[Num, $root]],
      handler: async (x: CoreCtx, [when, nextPhase]: [number|string,unknown]) => {
        return x.timer.schedule(new Date(when), () => nextPhase);
      }
    }))
    .popPath()!);


  const isPeerMessage = Guard('hi');
  const isMediatorMessage = Guard(['yo', Str, Any] as const);

  reg = reg.update(n => n
    .pushPath('$meetAt', ()=>({facs:List()}))
    .update(v => ({
      ...v,
      guard: [[Str, $root]],
      handler: async (x: CoreCtx, [spotId, hold]: [Id, [string,unknown]]) => {
        return x.convene([spotId], {
          convened([spot]) {
            const resp = spot.chat('hi');
            if(!resp) throw `Meeting rejected by mediator ${spotId}: message:?`;

            const [m] = resp;
            if(!isMediatorMessage(m)) return;

            const [,key] = m;

            //emplace key as last arg
            const [h0, h1] = hold;
            if(!isArray(h1)) throw 'Bad callback';

            h1[h1.length-1] = key;
            return [h0, h1];
          }
        });
      }
    }))
    .popPath()!);


  reg = reg.update(n => n
    .pushPath('$m', ()=>({facs:List()}))
    .pushPath('place', ()=>({facs:List()}))
    .update(v => ({
      ...v,
      guard: [Never],
      handler: async (x: CoreCtx) => {
        return ['$m_gather', [0, []]]
      }
    }))
    .popPath()!
    .popPath()!);

  reg = reg.update(n => n
    .pushPath('$m', ()=>({facs:List()}))
    .pushPath('gather', ()=>({facs:List()}))
    .update(v => ({
      ...v,
      guard: [[Num, Many(Str)]],
      handler: async (x: CoreCtx, [v, ids]: [number, Id[]]) => {
        const result = await x.attend({
          attended(m, mid) {
            if(isPeerMessage(m)) {
              ids = [...ids, mid];

              const k = `K${v}`;

              const quorum = 2;
              if(ids.length >= quorum) {
                return [
                  ['$m_mediate', [v, k, ids, []]],//remnant always empty currently
                  ['yo', k]
                ]; 
              }
              else {
                return [
                  ['$m_gather', [v, ids]],
                  ['yo', k]
                ];
              }
            }

            return [['$m_gather', [v, ids]]];
          }
        });

        return isArray(result) ? result[0] : false;
      }
    }))
    .popPath()!
    .popPath()!);


  reg = reg.update(n => n
    .pushPath('$m', ()=>({facs:List()}))
    .pushPath('mediate', ()=>({facs:List()}))
    .update(v => ({
      ...v,
      guard: [[Num,Str,Many(Str),Many(Str)]],
      handler: async (x: CoreCtx, [v,k,ids,remnants]: [number,string,Id[],Id[]]) => {
        return x.convene(ids, {
          convened(peers) {
            const answers: { [id:Id]:unknown } = {};

            for(const p of peers) {
              const r = p.chat([k, 'contribute'])
              if(!r) return fin({kickOut:[p]});

              answers[p.id] = r[0];
            }

            for(const p of peers) {
              p.chat([k, 'fin', answers]);
            }

            return fin({kickOut:[...peers]});


            function fin(p:{kickOut:Peer[]}) {
              return ['$m_gather', [v+1, [remnants, ...peers.subtract(p.kickOut)]]] as const;
            }
          }
        });
      }
    }))
    .popPath()!
    .popPath()!);

  return reg;
}


export const World = new Builder<{}>(Registry.empty)







        // watch(ids: Id[]): Observable<[Id, unknown]> {
        //   return _this.summon(Set(ids)) //TODO if the same thing is watched twice, commits will be added doubly
        //     .pipe(
        //       mergeMap(m => m.log$.pipe(
        //         map(l => <[Id, Log]>[m.id, l])
        //       )),
        //       tap(([,[,r]]) => { //gathering all watched atomrefs here into mutable Commit
        //         if(r) commit.add(List([r]))
        //       }),
        //       mergeMap(([id, [p]]) => p ? [<[Id, unknown]>[id, p]] : []),
        //     );
        // },

        // attach<R>(attend: Attendee<R>) {
        //   return _this.mediator.attach(machine, {
        //     chat(m, peers) {
        //       if(isArray(m) && m[0] == $Ahoy) {
        //         Committer.combine(new MonoidData(), [commit, <Committer<Data>>m[1]]);
        //         m = m[2];
        //       }

        //       const proxied = peers.map(p => <Peer>({
        //         chat(m) {
        //           return p.chat([$Ahoy, commit, m]);
        //         }
        //       }));
        //       return attend.chat(m, proxied);
        //     }
        //   });
        // },

        // async convene<R>(ids: Id[], convene: Convener<R>) {
        //   const m$ = _this.summon(Set(ids));

export type CoreCtx = {
  id: string
  timer: Timer
  watch: (ids: string[]) => Observable<readonly [string, unknown]>
  attend: <R>(attend: Attendee<R>|AttendedFn<R>) => Promise<false|[R]>
  convene: <R>(ids: string[], convene: Convener<R>|ConvenedFn<R>) => Promise<R>
  side: { get():unknown, set(d:unknown):void } 
  isFresh: () => boolean
}



export type Shape<S> = Simplify<_Assemble<_Walk<S>>>;

type _Walk<O, P extends string = ''> =
  [IsNever<O>] extends [false] ?
  [IsAny<O>] extends [false] ?
    (
      _DataWalk<O, P>
    | _FacWalk<O, P>
    | _InclWalk<O, P>
    | _SpaceWalk<O, P>
    )
  : never : never
;

type _DataWalk<O, P extends string> =
  $Data extends keyof O ?
  [_JoinPaths<'D', P>, O[$Data]]
  : never
;

type _FacWalk<O, P extends string> =
  $Fac extends keyof O ?
  [_JoinPaths<'XA', P>, O[$Fac]]
  : never
;

type _InclWalk<O, P extends string> =
  $Incl extends keyof O ?
  O[$Incl] extends Builder<infer I> ?

  //builder has already flattened to N map
  //disassemble them so that we can reassemble after... gah (should flatten more readily into lingua franca)
  keyof I extends infer IK ?
  IK extends keyof I ?
  [I[IK]] extends [infer IN] ?
  
  IK extends _JoinPaths<infer IKH, infer IKT> ?
  [_JoinPaths<IKH, _JoinPaths<P, IKT>>] extends [infer IK2] ?
  
  [IK2, IN]
  
  : never : never : never : never : never : never : never
;

type _SpaceWalk<O, P extends string = ''> =
  Except<keyof O, $Fac|$Data> extends infer K ?
    K extends string ?
    K extends keyof O ?
  _Walk<O[K], _JoinPaths<P, K>> extends infer Found ?
    [Found] extends [any] ?
      Found
      // ([`S${P}`, true] | Found)
  : never : never : never : never : never
;

type _Assemble<T extends readonly [string, unknown]> =
  { [kv in T as kv[0]]: kv[1] }
;

{
  const s1 = {
    hamster: {
      nibble: act(123 as const),
    },
    rabbit: {
      ...ctx<123>(),
      jump: act(7 as const),
    }
  };

  type A = _SpaceWalk<typeof s1>
  type B = _Assemble<A>

  type C = _SpaceWalk<typeof s2>
  type D = _Assemble<C>

  const w1 = World.shape(s1);

  const i2 = incl(w1);
  const s2 = { pet: i2 };
  const w2 = World.shape(s2);

  type E = _InclWalk<typeof i2, 'pet'>

  function blah<T extends number>(t:T) {
    const d = act(t);

    type F = _DataWalk<typeof d, 'path'>;
    type _ = [F]
  }



  const x = World.shape(s1);

  [s1,s2,w1,w2,x]
  type _ = [A,B,C,D,E]
}



type _UpstreamFacPaths<N, P extends string> =
  _JoinPaths<'XA', P> extends infer XP ?
  XP extends string ?
  // _KnownRoutePaths<N, XP> extends infer Route ?
  TupExclude<_KnownRoutePaths<N, XP>, XP> extends infer Route ?
    Route
  : never : never : never;

type _KnownRoutePaths<N, P extends string> =
  _AllRoutePaths<P> extends infer AS ?
  TupExtract<AS, keyof N> extends infer S ?
    S
  : never : never;

type _AllRoutePaths<P extends string, Path extends string = ''> =
  P extends `${infer Head}${Separator}${infer Tail}`
  ? readonly [..._AllRoutePaths<Head, Path>, ..._AllRoutePaths<Tail, _JoinPaths<Path, Head>>]
  : readonly [_JoinPaths<Path, P>];


type _JoinPaths<H extends string, T extends string> =
  H extends '' ? T
  : T extends '' ? H
  : `${H}${Separator}${T}`;


{
  type NN = {
    XA: { a: 1 }
    S: true,
    XA_rat: { b: 2 },
    S_rat: true,
    S_rat_squeak: true
    D_rat_squeak_quietly: 999,
    XA_rat_squeak_quietly: { c: 3 },
    S_rat_squeak_quietly: true,
    D_rat_squeak_quietly_blah: 999,
  }

  type A = FacPath<NN>

  type B = _AllRoutePaths<'XA'>
  type C = _AllRoutePaths<'XA_rat'>
  type D = _AllRoutePaths<'XA_rat_squeak_quietly_blah'>

  type E = _KnownRoutePaths<NN, 'XA'>
  type F = _KnownRoutePaths<NN, 'XA_rat'>
  type G = _KnownRoutePaths<NN, 'XA_rat_squeak_quietly_blah'>

  type H = _UpstreamFacPaths<NN, ''>
  type I = _UpstreamFacPaths<NN, 'rat'>
  type J = _UpstreamFacPaths<NN, 'rat_squeak_quietly'>
  type K = _UpstreamFacPaths<NN, 'rat_squeak_quietly_blah'>

  type L = FacContext<NN, 'rat'>
  type M = FacContext<NN, 'rat_squeak_quietly'>
  type N = FacContext<NN, 'rat_squeak_quietly_blah'>

  type _ = [A, B, C, D, E, F, G, H, I, J, K, L, M, N];
}



export type Except<A, B> =
  A extends B ? never : A;

{
  type A = 1 | 2 | 3 | 4;
  type B = 3 | 2;
  type C = Except<A,B>

  type _ = [A,B,C]
}


export type Intersects<A, B> =
  [A & B] extends [never] ? false : true;




type AllButLast<R extends readonly any[]> =
    R extends readonly [] ? []
  : R extends readonly [any] ? []
  : R extends readonly [infer H, ...infer T] ? [H, ...AllButLast<T>]
  : R extends readonly (infer E)[] ? readonly E[]
  : never;

function allButLast<R extends readonly any[]>(r: R): AllButLast<R> {
  let ac = [];
  for(let i = 0; i < r.length - 1; i++) ac.push(r[i]) 
  return <AllButLast<R>><unknown>ac;
}

{
  type A = AllButLast<readonly [1, 2, 3]>;
  type B = AllButLast<readonly []>;
  type C = AllButLast<readonly [1]>;
  type D = AllButLast<number[]>;
  type _ = [A, B, C, D]

  const a = allButLast([1, 2, 3] as const);
}



type Head<R extends readonly unknown[]> =
    R extends readonly [] ? never
  : R extends readonly [infer H, ...any] ? H
  : never;

type Tail<R extends readonly any[]> =
    R extends readonly [] ? never
  : R extends readonly [any, ...infer T] ? Readonly<T>
  : R extends readonly [any] ? never
  : R extends readonly (infer E)[] ? readonly E[]
  : never;

export function head<R extends readonly any[]>(r: R): Head<R> {
  return <Head<R>>r[0];
}

export function tail<R extends readonly any[]>(r: R): Tail<R> {
  const [_, ...t] = r;
  return <Tail<R>><unknown>t;
}



type TupExtract<R, Filter> =
    R extends readonly [] ? readonly []
  : R extends readonly [infer H, ...infer T] ? (
    H extends Filter ? readonly [H, ...TupExtract<T, Filter>] : TupExtract<T, Filter>
  )
  : never;

type TupExclude<R, Filter> =
    R extends readonly [] ? readonly []
  : R extends readonly [infer H, ...infer T] ? (
    H extends Filter ? TupExclude<T, Filter> : readonly [H, ...TupExclude<T, Filter>]
  )
  : never;

{
  type A = TupExtract<[], 1>
  type B = TupExtract<[1], 1>
  type C = TupExtract<[1], 0>
  type D = TupExtract<[1, 2, 3], 1|3>
  type _ = [A, B, C, D]
}




type PathList<PS extends string> =
    PS extends '' ? []
  : PS extends `${infer PHead}${Separator}${infer PTail}` ? [PHead, ...PathList<PTail>]
  : [PS];



type TupPopHead<L> =
    L extends [] ? [[], false]
  : L extends [infer H, ...infer T] ? [T, true, H]
  : never;

{
  type A = TupPopHead<[]>
  type B = TupPopHead<[1]>
  type C = TupPopHead<[1, 2, 3]>

  type _ = [A, B, C]
}


type IsNotNever<T> =
  [T] extends [never] ? false : true;



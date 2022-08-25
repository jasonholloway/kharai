import { List } from "immutable";
import { Observable } from "rxjs/internal/Observable";
import { isArray } from "util";
import { Any, Guard, Many, Never, Num, Str, And, Read } from "../guards/Guard";
import { Id } from "../lib";
import { AttendedFn, Attendee, ConvenedFn, Convener, Peer } from "../MachineSpace";
import { Handler, $data, $Data, $Fac, $Root, $root } from "../shapeShared";
import { Timer } from "../Timer";
import { DeepMerge, DeepSimplify, delay, Merge, Simplify } from "../util";
import { BuiltWorld } from "./BuiltWorld";
import { act, ctx, Data, FacContext, FacPath, formPath, Impls, PathFac, SchemaNode } from "./common";
import { Registry } from "./Registry";

export const separator = '_'
export type Separator = typeof separator;

type Nodes = { [k in string]: unknown }


export module World {

  export type TryMerge<A extends Nodes, B extends Nodes> =
    Merge<A,_MergeNew<A,B>> extends infer Merged ?
    Merged extends Nodes ?
    World<Merged>
    : never : never;

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



  export type TryBuild<N extends Nodes> =
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


  export type MergeFacImpl<N extends Nodes, P extends string, X> =
    Merge<N,
      {
        [k in _JoinPaths<'XI', P>]:
          k extends keyof N ?
          Merge<N[k],X>
          : X
      }> extends infer Merged ?
    Merged extends Nodes ?
    World<Merged>
    : never : never;
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




export type PhaseHelper<N extends Nodes, Out> = _WalkData<'',_ExtractData<N>, Data<N>, Out>

type _ExtractData<N> = {
  [k in keyof N as (k extends _JoinPaths<'D', infer P> ? P : never)]: N[k]
};

type _WalkData<P extends string, D, DAll, Out> = DeepSimplify<
  (
    P extends keyof D
      ? (
        Read<D[P], $Root, Out> extends infer V ?
        IsNotNever<V> extends true
          ? ((d: V) => Out)
          : (() => Out)
        : never
      )
      : unknown
  )
  & ({
    [N in _ExtractNextPrefixes<P,D> & string]: _WalkData<_JoinPaths<P,N>, D, DAll, Out>
  })
>;

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

export class World<N extends Nodes> {
  public readonly nodes: N = <N><unknown>{}
  readonly reg: Registry
  static TryMerge: any;
  
  constructor(reg?: Registry) {
    this.reg = reg ?? Registry.empty;
  }

  mergeWith<N2 extends Nodes>(other: World<N2>): World.TryMerge<N,N2> {
    return <World.TryMerge<N,N2>><unknown>new World(Registry.merge(this.reg, other.reg));
  }

  impl<S extends Impls<N,AndNext>>(s: S): World<N> {
    const reg2 = _walk(s, [], this.reg);
    return new World<N>(reg2);

    function _walk(n: unknown, pl: string[], r: Registry): Registry {
      switch(typeof n) {
        case 'function':
          return r.addHandler(formPath(pl), <Handler>n);

        case 'object':
          return Object.getOwnPropertyNames(n)
              .reduce((ac, pn) => _walk((<any>n)[pn], [...pl, pn], ac), r);

        default:
          throw Error('strange item encountered');
      }
    }
  }

  paths(): FacPath<N> {
    throw 'err';
  }

  ctxImpl<P extends FacPath<N>, X extends Partial<PathFac<N,P>>>(path: P, fn: (x: FacContext<N,P>)=>X) : World.MergeFacImpl<N,P,X> {
    return <World.MergeFacImpl<N,P,X>>new World(this.reg.addFac(path, fn));
  }

  //we don't need no special symbols or owt
  //as long as we can only access Phase via helpers
  //so the exact type returned by the helpers has to be generic parameter
  //unique to that impl block
  //so we can't mix and match by strange means

  build(): World.TryBuild<N> {
    return <World.TryBuild<N>><unknown>new BuiltWorld<N>(this.reg);
  }

  
  static shape<S extends SchemaNode>(s: S) {
    let reg = _walk([], s)
      .reduce(
        (ac, [p, g]) => ac.addGuard(p, g),
        Registry.empty
      );

    type BuiltIns = {
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

    reg = reg
      .addFac('', x => x);

    reg = reg
      .addGuard('boot', Any)
      .addHandler('boot', async (x: CoreCtx) => {
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
      });

    reg = reg
      .addGuard('end', Any)
      .addHandler('end', async () => {
        return false;
      });

    reg = reg
      .addGuard('wait', [Num, $root])
      .addHandler('wait', (x: CoreCtx, [when, nextPhase]: [number|string, unknown]) => {
        return x.timer.schedule(new Date(when), () => nextPhase);
      });



    const isPeerMessage = Guard('hi');
    const isMediatorMessage = Guard(['yo', Str, Any] as const);

    reg = reg
      .addGuard('$meetAt', [Str, $root])
      .addHandler('$meetAt', (x: CoreCtx, [spotId, hold]: [Id, [string,unknown?]]) => {
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
      });

    reg = reg
      .addGuard('$m_place', Never)
      .addHandler('$m_place', async (x: CoreCtx) => {
        return ['$m_gather', [0, []]]
      });

    reg = reg
      .addGuard('$m_gather', [Num, Many(Str)])
      .addHandler('$m_gather', async (x: CoreCtx, [v, ids]: [number, Id[]]) => {
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
      });

    reg = reg
      .addGuard('$m_mediate', [Num,Str,Many(Str),Many(Str)])
      .addHandler('$m_mediate', (x: CoreCtx, [v,k,ids,remnants]: [number,string,Id[],Id[]]) => {
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
      });

    
    return <World.TryMerge<BuiltIns,Shape<S>>>new World<Shape<S>>(reg);

    //TODO inject CoreCtx into reg

    function _walk(pl: string[], n: SchemaNode) : List<readonly [string, unknown]> {
      if((<any>n)[$data]) {
        const data = <unknown>(<any>n)[$data];
        return List([[pl.join(separator), data] as const]);
      }

      if(typeof n === 'object') {
        return List(Object.getOwnPropertyNames(n))
          .flatMap(pn => {
            const child = (<any>n)[pn];
            return _walk([...pl, pn], child)
          });
      }

      throw 'strange node encountered';
    }
  }
}

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


export type Shape<S> =
  Simplify<_Assemble<_Walk<S>>> extends infer N ?
  N extends Nodes ?
  N
  : never : never;
  

type _Walk<O, P extends string = ''> =
    _DataWalk<O, P>
  | _FacWalk<O, P>
  | _SpaceWalk<O, P>
;

type _DataWalk<O, P extends string> =
  $Data extends keyof O ?
  O[$Data] extends infer D ?
  [`D${P}`, D]
  : never : never
;

type _FacWalk<O, P extends string> =
  $Fac extends keyof O ?
  O[$Fac] extends infer F ?
  [`XA${P}`, F]
  : never : never
;

type _SpaceWalk<O, P extends string = ''> =
  Except<keyof O, $Fac|$Data> extends infer K ?
    K extends string ?
    K extends keyof O ?
    _Walk<O[K], `${P}${Separator}${K}`> extends infer Found ?
    [Found] extends [any] ?
      Found
      // ([`S${P}`, true] | Found)
  : never : never : never : never : never
;

type _Assemble<T extends readonly [string, unknown]> =
  { [kv in T as kv[0]]: kv[1] }
;

{
  const s = {
    hamster: {
      nibble: act(123 as const),
    },
    rabbit: {
      ...ctx<123>(),
      jump: act(7 as const),
    }
  };

  type A = _SpaceWalk<typeof s>
  type B = _Assemble<A>

  const x = World.shape(s);
  x

  type C = 14 & unknown

  type _ = [A,B,C]
}



type _UpstreamFacPaths<N extends Nodes, P extends string> =
  _JoinPaths<'XA', P> extends infer XP ?
  XP extends string ?
  // _KnownRoutePaths<N, XP> extends infer Route ?
  TupExclude<_KnownRoutePaths<N, XP>, XP> extends infer Route ?
    Route
  : never : never : never;

type _KnownRoutePaths<N extends Nodes, P extends string> =
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
  type Nodes = {
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

  type A = FacPath<Nodes>

  type B = _AllRoutePaths<'XA'>
  type C = _AllRoutePaths<'XA_rat'>
  type D = _AllRoutePaths<'XA_rat_squeak_quietly_blah'>

  type E = _KnownRoutePaths<Nodes, 'XA'>
  type F = _KnownRoutePaths<Nodes, 'XA_rat'>
  type G = _KnownRoutePaths<Nodes, 'XA_rat_squeak_quietly_blah'>

  type H = _UpstreamFacPaths<Nodes, ''>
  type I = _UpstreamFacPaths<Nodes, 'rat'>
  type J = _UpstreamFacPaths<Nodes, 'rat_squeak_quietly'>
  type K = _UpstreamFacPaths<Nodes, 'rat_squeak_quietly_blah'>

  type L = FacContext<Nodes, 'rat'>
  type M = FacContext<Nodes, 'rat_squeak_quietly'>
  type N = FacContext<Nodes, 'rat_squeak_quietly_blah'>

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



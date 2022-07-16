import { List } from "immutable";
import { Observable } from "rxjs/internal/Observable";
import { Read } from "../guards/Guard";
import { Attendee, Convener } from "../Mediator";
import { Handler, $Root, SchemaNode, $data, $Data, $Fac, act, ctx } from "../shapeShared";
import { DeepMerge, Merge, Simplify } from "../util";
import { BuiltWorld } from "./BuiltWorld";
import { formPath } from "./common";
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

  impl<S extends Impls<N>>(s: S): World<N> {
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

  build(): World.TryBuild<N> {
    return <World.TryBuild<N>><unknown>new BuiltWorld<N>(this.reg);
  }

  
  static shape<S extends SchemaNode>(s: S) { //} : World<Shape<S>> {
    const reg = _walk([], s)
      .reduce(
        (ac, [p, g]) => ac.addGuard(p, g),
        Registry.empty
      );

    type Merged = World.TryMerge<{XA:CoreCtx},Shape<S>>
    
    return <Merged>new World<Shape<S>>(reg);

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
  watch: (ids: string[]) => Observable<readonly [string, unknown]>
  attach: <R>(attend: Attendee<R>) => unknown
  convene: <R>(ids: string[], convene: Convener<R>) => unknown
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


export type NodePath<N extends Nodes> = _ExtractPath<'S'|'D', keyof N> | ''
export type DataPath<N extends Nodes> = _ExtractPath<'D', keyof N>
export type FacPath<N extends Nodes> = _ExtractPath<'XA', keyof N>

type _ExtractPath<A extends string, K> =
    K extends A ? ''
  : K extends `${A}${Separator}${infer P}` ? P
  : never


export type Data<N extends Nodes, Inner = unknown> =
  keyof N extends infer K ?
  K extends `D${Separator}${infer P}` ?
  N[K] extends infer G ?
  Read<G, $Root, Inner> extends infer D ?
  [P, D]
  : never : never : never : never;



export type Impls<N extends Nodes> =
  [Data<N>] extends [infer DOne] ?
  [Data<N, DOne>] extends [infer DFull] ?
  [_ImplSplit<N>] extends [infer Tups] ?
    _ImplCombine<[Tups], {}, DOne, DFull>
  : never : never : never
;

type _ImplSplit<N extends Nodes> =
  keyof N extends infer K ?
  K extends keyof N ?
  K extends string ?
  TupPopHead<PathList<K>> extends [infer Tail, infer Popped, infer Head] ?
  Popped extends true ?
    readonly [Tail, Head, N[K]]
  : never : never : never : never : never
;

type _ImplCombine<Tups, X0, DOne, DAll> =
  (
    [
      Tups extends readonly [infer I] ?
      I extends readonly [[], 'XA', infer V] ? V
      : never : never
    ] extends readonly [infer X1] ?
    IsNotNever<X1> extends true ? Merge<X0, X1> : X0
    : never
  ) extends infer X ?

  [
    Tups extends readonly [infer I] ?
    I extends readonly [[], 'D', infer V] ? V
    : never : never
  ] extends readonly [infer D] ?
  IsNotNever<D> extends true ? ((x:X, d:Read<D, $Root, DOne>)=>Promise<DAll|false>)

  : {
    [Next in
      Tups extends readonly [infer I] ?
      I extends readonly [readonly [infer PH, ...infer PT], ...infer T] ?
      PH extends string ?
      [PH, [PT, ...T]]
      : never : never : never
     as Next[0]
    ]?: _ImplCombine<[Next[1]], X, DOne, DAll>
  }

  : never : never
;

{
  type W = {
    XA: { a:1 },
    D_rat_squeak: 123,
    XA_cat: { b:2 },
    D_cat_meeow: 456
  };

  type A = _ImplSplit<W>
  type B = _ImplCombine<[A], {}, 'DOne', 'DAll'>
  type C = Impls<W>

  type _ = [A, B, C]
}

{
  type N = {
    S: true,
    S_hamster: true
    S_hamster_squeak: true
    D_hamster_squeak_quietly: 123
    D_hamster_bite: 456,
  }

  type A = NodePath<N>
  type B = DataPath<N>
  type I = Impls<N>

  const i:I = {
    hamster: {
      squeak: {
        async quietly(x, d) {
          throw 123;
        }
      }
    }
  };

  type _ = [A,B,I]
  i
}



export type PathFac<N extends Nodes, P extends string> =
  _JoinPaths<'XA', P> extends infer XP ?
  XP extends keyof N ?
    N[XP]
  : never : never;


export type FacContext<N extends Nodes, P extends string> =
  Merge<
    _PathContextMerge<N, _UpstreamFacPaths<N, P>>,
    (
      _JoinPaths<'XI', P> extends infer XIP ?
      XIP extends keyof N ?
        N[XIP]
        : {}
      : never
    )
  >

// on extending, if we promised to be last in the list, we could rely on XA
// _but_ we couldn't extend the contract
// but that's how things are already
// only XAs can extend the contract
//
// what it would mean, this other mode, is that the impls own output wouldn't be consumable by followers
// unless they themselves opted to go on the end as well
//
// why would any fac not go on the end then?
// because you might want purposely to provide for future siblings
//
// so if you opted into being up front, you can only extend what's already in the list (ie XI)
// then other front-loaders can see you because you've added to XI0 
// the action is a split between XI0 and XI1, downstream acts are of course oblivious
//
// XI1s can't stack... last must mean last: you can'thave more than one last, receiving the full breadth of the XA
// so it's an ordered list of types, from <never> to XI to XA
// pinning to the end doesn't really work anyway, as some of the XA will be self-provided (unless we are to be purely parasitical)
//
// but pinning to the beginning might work
// in fact, multiple facs can pin to the beginning, basically opting out of receiving any upstream sibling contexts
// this pinning must be registered on the XA - it makes 
//
// I can try and settlethis later...
// for now, lets bring all the tests up to date eh
//

type _PathContextMerge<N, PL> =
    PL extends readonly [] ? {}
  : PL extends readonly [infer H, ...infer T] ? (
      H extends keyof N ?
      Merge<N[H], _PathContextMerge<N, T>>
      : never
    )
  : never;


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



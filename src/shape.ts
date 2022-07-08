import { Map, List } from "immutable";
import { Read } from "./guards/Guard";
import { $Data, $Fac, act, ctx, SchemaNode, Handler, $data, $Root, Fac } from "./shapeShared";
import { DeepMerge, Merge, Simplify } from "./util";

export const separator = '_'
export type Separator = typeof separator;

type Nodes = { [k in string]: unknown }


//TODO return Builder or error
//we can't wrap all in a tuple because we need to do dispatch directly against the result

export module Builder {

  export type TryMerge<A extends Nodes, B extends Nodes> =
    Merge<A,_MergeNew<A,B>> extends infer Merged ?
    Merged extends Nodes ?
    Builder<Simplify<Merged>>
    : never : never;

  type _MergeNew<A,B> = {
    [k in keyof B]:
      k extends `D_${string}` ? (
        //data must be invariantly equal
        k extends keyof A ?
          A[k] extends B[k] ?
          B[k] extends A[k] ?
          B[k]
          : never : never : never
        //need to pool errors somehow
      )
    : k extends `XA_${string}` ? (
        //contracts should merge nicely
        k extends keyof A ?
        DeepMerge<A[k], B[k]> //tried MergeDeep here but it's naff (currently)
        : B[k]
      )
    : k extends `XI_${string}` ? (
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
      ? World<N>
      : ['Unimplemented facs found', Results]
    : never;

  type _FindUnimplementedFacs<N,X> =
    X extends keyof N ?
    X extends `XA${infer Rest}` ? 
    `XI${Rest}` extends infer XI ?
    XI extends keyof N ?
    N[XI] extends N[X] ? never
    : [Rest, N[X], N[XI]]
    : [Rest, N[X], never]
    : never : never : never;


  export type MergeFacImpl<N extends Nodes, P extends string, X> =
    Builder<Merge<
      N,
      {
        [k in _JoinPaths<'XI', P>]:
          k extends keyof N ?
          Merge<N[k],X>
          : X
      }
    >>
}

{
  type A = {
    D: 444,
    D_blah: 123,
    XA: { a:1 },
    XI: { a:1 },
    XA_moo: { b:3 },
    XI_moo: { b:3 },
    // XA_chinchilla: {c: 9}
  };

  type H = Builder.TryBuild<A>

  const w = world({
    meeow: {
      ...ctx<{a:1}>()
    }
  }).build();

  const _ = w;
  type _ = [A,H];
}


export class Builder<N extends Nodes> {
  public readonly nodes: N = <N><unknown>{}
  readonly reg: Registry
  
  constructor(reg?: Registry) {
    this.reg = reg ?? Registry.empty;
  }

  mergeWith<N2 extends Nodes>(other: Builder<N2>): Builder.TryMerge<N,N2> {
    return <Builder.TryMerge<N,N2>><unknown>new Builder(Registry.merge(this.reg, other.reg));
  }

  impl<S extends Impls<N>>(s: S): Builder<N> {
    const reg2 = _walk(s, [], this.reg);
    return new Builder<N>(reg2);

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

  ctxImpl<P extends FacPath<N>, X extends Partial<PathFac<N,P>>>(path: P, fn: (x: FacContext<N,P>)=>X) : Builder.MergeFacImpl<N,P,X> {
    return new Builder(this.reg.addFac(path, fn));
  }

  build(): Builder.TryBuild<N> {
    return <Builder.TryBuild<N>><unknown>new World<N>(this.reg);
  }
}

// when N is good return 
//
//
//





export class World<N> {
  public readonly nodes: N = <N><unknown>{}
  readonly reg: Registry

  constructor(reg?: Registry) {
    this.reg = reg ?? Registry.empty;
  }

  read(address: string): ReadResult {
    const reg = this.reg;
    return _read([], address.split(separator));

    function _read(pl: readonly string[], al: readonly string[]): ReadResult {
      if(al.length) {
        const [aHead, ...aTail] = al;
        return _read([...pl, aHead], aTail);
      }

      const path = formPath(pl);

      return {
        guard: reg.getGuard(path),
        handler: reg.getHandler(path),
        fac: _formFac(List(pl))
      };
    }

    function _formFac(pl: List<string>) : Fac {
      const facs = _findFacs(pl);
      return facs.reduce(
        (ac, fn) => x => {
          const r = ac(x);
          return { ...r, ...fn(r) };
        },
        (x => x));
    }

    function _findFacs(pl: List<string>): Fac[] {
      if(pl.isEmpty()) return reg.getFacs('');

      const l = _findFacs(pl.butLast());
      const r = reg.getFacs(formPath([...pl]))

      return [...l, ...r];
    }
  }
}

function formPath(pl: readonly string[]) {
  return pl.join(separator);
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


export type ReadResult = {
  guard?: any,
  handler?: Handler,
  fac?: Fac
}


class Registry {
  private guards: Map<string, unknown> = Map();
  private handlers: Map<string, Handler> = Map();
  private facs: Map<string, Fac[]> = Map();

  private constructor(guards: Map<string, unknown>, handlers: Map<string, Handler>, facs: Map<string, Fac[]>) {
    this.guards = guards;
    this.handlers = handlers;
    this.facs = facs;
  }

  static empty = new Registry(Map(), Map(), Map());
  private static $notFound = Symbol('notFound');

  addGuard(p: string, guard: unknown): Registry {
    return new Registry(
      this.guards.set(p, guard),
      this.handlers,
      this.facs
    );
  }

  getGuard(p: string): [unknown] | undefined {
    const result = this.guards.get(p, Registry.$notFound);
    return result !== Registry.$notFound
      ? [result] : undefined;
  }

  addHandler(p: string, h: Handler): Registry {
    return new Registry(
      this.guards,
      this.handlers.set(p, h),
      this.facs
    );
  }

  getHandler(p: string): Handler | undefined {
    return this.handlers.get(p);
  }

  addFac(p: string, fac: Fac): Registry {
    return new Registry(
      this.guards,
      this.handlers,
      this.facs.mergeDeep({ [p]: [fac] })
   );
  } 

  getFacs(p: string): Fac[] {
    return this.facs.get(p, []);
  } 

  static merge(a: Registry, b: Registry) {
    return new Registry(
      a.guards.merge(b.guards),
      a.handlers.merge(b.handlers),
      a.facs.mergeDeep(b.facs)
    );
  }
}


export function world<S extends SchemaNode>(s: S) : Builder<Shape<S>> {
  const reg = _walk([], s)
    .reduce(
      (ac, [p, g]) => ac.addGuard(p, g),
      Registry.empty
    );

  return new Builder<Shape<S>>(reg);

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


export type Shape<S> = Simplify<_Assemble<_Walk<S>>>;

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

  const x = world(s)
  x

  type C = 14 & unknown

  type _ = [A,B,C]
}




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



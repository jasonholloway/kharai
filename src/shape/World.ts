import { List, Set } from "immutable";
import { inspect, isArray, isString } from "util";
import { Any, Guard, Many, Never, Num, Str } from "../guards/Guard";
import { Id } from "../lib";
import { $skip, MachineCtx, Peer } from "../MachineSpace";
import { Handler, $data, $Data, $Fac, $Root, $root, $Incl, $incl, Projector, Fac } from "../shapeShared";
import { DeepMerge, delay, IsAny, IsNever, Merge, Simplify } from "../util";
import { BuiltWorld } from "./BuiltWorld";
import { act, ctx, FacContext, FacPath, incl, isDataNode, isInclNode, PathFac, SchemaNode, _Data } from "./common";
import { mergeNodeVal, NodeVal, NodeView, Registry } from "./Registry";
import * as Impls from './Impls'
import * as NodeTree from "./NodeTree";

export const separator = '_'
export type Separator = typeof separator;

export module Builder {

  //below should leave hanging XAs...
  export type Seal<N> =
    {
      [k in (
        keyof N extends infer NK ?
          NK extends string ?
          NK extends 'D' | JoinPaths<'D', string> ?
            NK
          : never : never : never
      )]: N[k]
    }
  ;

  export type TryMerge<A, B> =
    Builder<
      Merge<A,_MergeNew<A,B>>
    >;

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


  export type TryBuild<N> =
    [_FindUnimplementedFacs<N, keyof N>] extends [infer Results] ?
    [Results] extends [[]]
    ? BuiltWorld<N,AndNext>
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

  export type MergeNode<N, T, P extends string, X> =
    Merge<N,
      {
        [k in (
              T extends infer TT
            ? TT extends string
            ? JoinPaths<TT, P>
            : never : never
        )]:
          k extends keyof N ?
          Merge<N[k],X>
          : X
      }> extends infer Merged
    ? Builder<Merged>
    : never
  ;

  export type AtPath<P extends string, N> =
    Builder<{
      [k in keyof N as
       k extends JoinPaths<infer PH, infer PT>
        ? JoinPaths<PH, JoinPaths<P, PT>>
        : never
      ]: N[k]
    }>
  ;
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


//can only summon phases with string args

//todo would be nice if below wasn't exported
const $unique = Symbol('');
export interface AndNext {
  tag: typeof $unique
}


export class Builder<N> {
  public readonly nodes = <N><unknown>{}
  public readonly tree = <NodeTree.Form<N>><unknown>{}

  readonly reg: Registry
  
  constructor(reg?: Registry) {
    this.reg = reg ?? Registry.empty;
  }

  with<N2>(other:Builder<N2>): Builder.TryMerge<N, N2> {
    return <Builder.TryMerge<N,N2>><unknown>new Builder(this.reg.mergeWith(other.reg));
  }

  //TODO: should either retain or forbid hanging XAs
  seal(): Builder<Simplify<Builder.Seal<N>>> {
    return <Builder<Simplify<Builder.Seal<N>>>><unknown>this;
  }

  paths(): FacPath<N> {
    throw 'err';
  }

  ctxImpl<P extends FacPath<N>, X extends Partial<PathFac<N,P>>>(path: P, fn: (x: FacContext<NodeTree.Form<N>,N,P,AndNext>)=>X) : Builder.MergeNode<N,JoinPaths<'XI', 'M'>,P,X> {
    const pl = path.split(separator);
    
    return <Builder.MergeNode<N,'XI',P,X>>new Builder(
      this.reg.update(root => root
        .pushPath('M')
        .summon(pl)
        .update(v => ({
          ...v,
          facs: v.facs.push(fn)
        })))
    );
  }

  ctx<X>(fn: (x: FacContext<NodeTree.Form<N>,N,'',AndNext>)=>X): Builder.MergeNode<N, 'XA'|'XI', '', X> {
    return <Builder.MergeNode<N, 'XA'|'XI', '', X>>new Builder(
      this.reg.update(root => root
        .pushPath('M')
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
    const reg2 = this.reg
      .update(root =>
        _walk(root.pushPath('M'), s).popPath()!
      );

    return <Builder.TryMerge<N,Shape<S>>><unknown>new Builder<Shape<S>>(reg2);


    function _walk(n0: NodeView<NodeVal>, obj: SchemaNode): NodeView<NodeVal> {
      const n1 = isDataNode(obj)
        ? n0.update(v => ({ ...v, guard:[obj[$data]] }))
        : n0;

      const n2 = isInclNode(obj)
        ? n1.mergeIn(mergeNodeVal, obj[$incl].reg.root.pluck('M'))
        : n1;

      if(typeof obj === 'object') {
        return Object
          .getOwnPropertyNames(obj)
          .reduce(
            (n, pn) => _walk(n.pushPath(pn), (<any>obj)[pn]).popPath()!,
            n2
          );
      }

      throw Error('strange node')
    }
  }

  impl<S extends Impls.Form<NodeTree.Form<N>,AndNext>>(s: S): Builder<N> {
    return new Builder<N>(this.reg
      .update(root =>
        _walk(root.pushPath('M'), s, List()).popPath()!
      ));

    function _walk(n: NodeView<NodeVal>, obj: unknown, pl: List<string>): NodeView<NodeVal> {
      if(obj === undefined) return n;

      switch(typeof obj) {
        case 'object': return _walkObj(n, <object>obj, pl);
        case 'function': return _walkHandler(n, <Function>obj, pl)
        default: return n;
      }
    }

    function _walkObj(n: NodeView<NodeVal>, obj: object, pl: List<string>): NodeView<NodeVal> {
      if(n.node.val.guard) return _walkFullPhase(n, obj, pl);
      else return _walkSpace(n, obj, pl);
    }

    function _walkSpace(n: NodeView<NodeVal>, obj: object, pl: List<string>, skipProps?: Set<string>): NodeView<NodeVal> {
      return Object
        .getOwnPropertyNames(obj)
        .filter(pn => !(skipProps?.contains(pn) ?? false))
        .reduce(
          (n0, pn) => {
            const prop = (<{[k:string]:unknown}>obj)[pn];
            const n1 = n0.pushPath(pn);
            const n2 = _walk(n1, prop, pl.push(pn));
            return n2.popPath()!;
          },
          n
        );
    }

    function _walkFullPhase(n0: NodeView<NodeVal>, obj: {act?:Function, show?:Function}, pl: List<string>): NodeView<NodeVal> {
      const n1 = _walkSpace(n0, obj, pl, Set(['act','show']));
      const n2 = obj.act ? _walkHandler(n1, obj.act, pl) : n1;
      const n3 = obj.show ? _walkProjector(n2, obj.show, pl) : n2;
      return n3;
    }

    function _walkHandler(n: NodeView<NodeVal>, fn:Function, pl: List<string>): NodeView<NodeVal> {
      return n
        .update(v => ({
          ...v,
          handler: <Handler>fn
        }));
    }

    function _walkProjector(n: NodeView<NodeVal>, fn:Function, pl: List<string>): NodeView<NodeVal> {
      return n
        .update(v => ({
          ...v,
          projector: <Projector>fn
        }));
    }
  }

  build(): Builder.TryBuild<N&BuiltIns> {
    const reg0 = this.reg.mergeWith(builtIns());

    // console.debug(inspect(
    //   reg0.root.show(v => ''),
    //   {depth:5}
    // ));

    const withRelPaths = reg0.root
      .mapDepthFirst<[NodeVal, List<List<string>>]>(
        [{facs:List()},List()],
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
        [{facs:List()},List()],
        ([val,ps], ancestors, route) => {
          const ancestorPaths = ancestors
            .flatMap(([,ls]) => ls);

          const relPaths = ps
            .map(p => <[List<string>,List<string>]>[p, route.concat(p)]);

          const allPaths = ancestorPaths
            .concat(relPaths);

          return [val, allPaths];
        }
      );

    const withCtx = withAllPaths
      .mapDepthFirst<[NodeVal, List<[List<string>,List<string>]>]>(
        [{facs:List()},List()],
        ([v, paths], _, pl) => {
          return [
            {
              ...v,
              facs: v.facs.push(x => {

                const builtInPaths = paths
                  .filter(([[p]]) => p === '*')
                  .map(([al,zl]) => <[List<string>,List<string>]>[al.rest(), zl]);

                const pathMap = paths
                  .concat(builtInPaths)
                  .filter(([[p]]) => !!p && p !== '*' && p !== 'M');

                // console.debug(inspect(pathMap.map(m => [[...m[0]], m[1]]).toJSON(), {depth:3}))

                const and = _buildAnd(pathMap);
                const ref = _buildRef(pathMap);
                const expandType = (x:unknown)=>x; //????????

                return { ...x, and, ref, expandType };
              })
            },
            paths
          ];
        });

    const withoutPaths = withCtx
      .mapBreadthFirst({facs:List<Fac>()}, ([v]) => v);

    const reg1 = new Registry(withoutPaths);

    return <Builder.TryBuild<N&BuiltIns>><unknown>new BuiltWorld(reg1);

    
    function _buildAnd(availPaths: List<[List<string>,List<string>]>): object {
      const ac = {};

      for(const [al,zl] of availPaths) {
        emplace(ac, al, zl.join(separator));
      }

      (<{[k:string]:unknown}>ac)['skip'] = () => $skip;

      return ac;


      function emplace(o:{[k: string]: unknown}, pl:List<string>, pTo:string) {
        const [ph] = pl;
        let o2 = <{[k:string]:unknown}>(o[ph] ?? {});

        if(pl.count() > 1) {
          emplace(o2, pl.rest(), pTo)
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

    function _buildRef(availPaths: List<[List<string>,List<string>]>): object {
      const ac = {};

      for(const [al,zl] of availPaths) {
        emplace(ac, al, zl.join(separator));
      }

      return ac;


      function emplace(o:{[k: string]: unknown}, pl:List<string>, pTo:string) {
        const [ph] = pl;
        let o2 = <{[k:string]:unknown}>(o[ph] ?? {});

        if(pl.count() > 1) {
          emplace(o2, pl.rest(), pTo)
        }
        else if(ph) {
          o2 = Object.assign(
            ((...args:unknown[]) => [`@${pTo}`, ...args].join(',')),
            <{[k:string]:unknown}>{});
        }
        else {
          throw Error();
        }

        o[ph] = o2;
      }
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


type AnonCtx = MachineCtx<{}, [], AndNext>;


export type BuiltIns = {
  XA_M: AnonCtx //todo these could be collapsed into simple, single 'X' entry
  XI_M: AnonCtx
  'D_M_*boot': never,
  'D_M_*end': typeof Any,
  'D_M_*wait': [typeof Num | typeof Str, $Root],


  //BELOW NEED TO BE ABLE TO DO ANDS IN GUARDS!
  'D_M_$meetAt': [typeof Str, $Root],

  'D_M_$m_place': never,
  'D_M_$m_gather': [typeof Num, typeof Str[]], //[version, ids]
  'D_M_$m_mediate': [typeof Num, typeof Str, typeof Str[], typeof Str[]] //[version, key, ids, remnants]
};


function builtIns() {
  let reg = Registry.empty;

  reg = reg.update(n => n
    .update(v => ({
      ...v,
      facs: v.facs.push(x => x)
    })));

  reg = reg.update(n => n
    .pushPath('*')
    .pushPath('boot')
    .update(v => ({
      ...v,
      guard: [Any],
      async handler(x: AnonCtx) {
        while(true) {
          const answer = await x.attend({
            attended(m) {
              return [m, true];
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
    .pushPath('*')
    .pushPath('end')
    .update(v => ({
      ...v,
      guard: [Any],
      async handler() {
        return false;
      }
    }))
    .popPath()!);
  
  reg = reg.update(n => n
    .pushPath('*')
    .pushPath('wait')
    .update(v => ({
      ...v,
      guard: [[Num, $root]],
      handler: async (x: AnonCtx, [when, nextPhase]: [number|string,unknown]) => {
        return await x.timer
          .schedule(new Date(when), () => nextPhase)
      }
    }))
    .popPath()!);


  const isPeerMessage = Guard('hi');
  const isMediatorMessage = Guard(['yo', Str, Any] as const);

  reg = reg.update(n => n
    .pushPath('*')
    .pushPath('$meetAt')
    .update(v => ({
      ...v,
      guard: [[Str, $root]],
      handler: async (x: AnonCtx, [spotId, hold]: [Id, [string,unknown]]) => {
        return x.convene([spotId], {
          convened([spot]) {
            const resp = spot.chat('hi');
            if(!resp) throw `Meeting rejected by mediator ${spotId}`;

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
    .pushPath('*')
    .pushPath('$m')
    .pushPath('place')
    .update(v => ({
      ...v,
      guard: [Never],
      handler: async (x: AnonCtx) => {
        return ['*_$m_gather', [0, []]]
      }
    }))
    .popPath()!
    .popPath()!);

  reg = reg.update(n => n
    .pushPath('*')
    .pushPath('$m')
    .pushPath('gather')
    .update(v => ({
      ...v,
      guard: [[Num, Many(Str)]],
      handler: async (x: AnonCtx, [v, ids]: [number, Id[]]) => {
        const result = await x.attend({
          attended(m, mid) {
            if(isPeerMessage(m) && isString(mid)) {
              ids = [...ids, mid];

              const k = `K${v}`;

              const quorum = 2;
              if(ids.length >= quorum) {
                return [
                  ['*_$m_mediate', [v, k, ids, []]],//remnant always empty currently
                  ['yo', k]
                ]; 
              }
              else {
                return [
                  ['*_$m_gather', [v, ids]],
                  ['yo', k]
                ];
              }
            }

            return [['*_$m_gather', [v, ids]]];
          }
        });

        return isArray(result) ? result[0] : false;
      }
    }))
    .popPath()!
    .popPath()!);


  reg = reg.update(n => n
    .pushPath('*')
    .pushPath('$m')
    .pushPath('mediate')
    .update(v => ({
      ...v,
      guard: [[Num,Str,Many(Str),Many(Str)]],
      handler: async (x: AnonCtx, [v,k,ids,remnants]: [number,string,Id[],Id[]]) => {
        return x.convene(ids, {
          convened(peers) {
            const answers: { [id:Id]:unknown } = {};

            for(const p of peers) {
              if(p.id) {
                const r = p.chat([k, 'contribute'])
                if(!r) return fin({kickOut:[p]});

                answers[p.id] = r[0];
              }
            }

            for(const p of peers) {
              p.chat([k, 'fin', answers]);
            }

            return fin({kickOut:[...peers]});


            function fin(p:{kickOut:Peer[]}) {
              return ['*_$m_gather', [v+1, [remnants, ...peers.subtract(p.kickOut)]]] as const;
            }
          }
        });
      }
    }))
    .popPath()!
    .popPath()!);

  return reg;
}


//temporary exclusion below
// export const World = new Builder<BuiltIns>(Registry.empty)
export const World = new Builder<{}>(Registry.empty)



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
  [JoinPaths<JoinPaths<'D', 'M'>, P>, O[$Data]]
  : never
;

type _FacWalk<O, P extends string> =
  $Fac extends keyof O ?
  [JoinPaths<JoinPaths<'XA', 'M'>, P>, O[$Fac]]
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
  
  IK extends JoinPaths<infer IKH, infer IKT> ?
  IKT extends JoinPaths<'M', infer IKT2> ?

  [JoinPaths<IKH, JoinPaths<'M',JoinPaths<P, IKT2>>>] extends [infer IK2] ?
  
  [IK2, IN]
  
  : never : never : never : never : never : never : never : never
;

type _SpaceWalk<O, P extends string = ''> =
  Except<keyof O, $Fac|$Data> extends infer K ?
    K extends string ?
    K extends keyof O ?
  _Walk<O[K], JoinPaths<P, K>> extends infer Found ?
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
  JoinPaths<'XA', P> extends infer XP ?
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
  ? readonly [..._AllRoutePaths<Head, Path>, ..._AllRoutePaths<Tail, JoinPaths<Path, Head>>]
  : readonly [JoinPaths<Path, P>];


export type JoinPaths<H extends string, T extends string> =
  H extends '' ? T
  : T extends '' ? H
  : `${H}${Separator}${T}`;


{
  type NN = {
    XA_M: { a: 1 }
    XA_M_rat: { b: 2 },
    D_M_rat_squeak_quietly: 999,
    XA_M_rat_squeak_quietly: { c: 3 },
    D_M_rat_squeak_quietly_blah: 999,
  }

  type TT = NodeTree.Form<NN>

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

  type L = FacContext<TT, NN, 'rat', 0>
  type M = FacContext<TT, NN, 'rat_squeak_quietly', 0>
  type N = FacContext<TT, NN, 'rat_squeak_quietly_blah', 0>

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




export type PathList<PS extends string> =
    PS extends '' ? []
  : PS extends `${infer PHead}${Separator}${infer PTail}` ? [PHead, ...PathList<PTail>]
  : [PS];



export type TupPopHead<L> =
  L extends readonly [] ? readonly [false, never]
  : L extends readonly [infer H, ...infer T] ? readonly [true, [H, T]]
  : never
;

{
  type A = TupPopHead<[]>
  type B = TupPopHead<[1]>
  type C = TupPopHead<[1, 2, 3]>

  type _ = [A, B, C]
}


export type IsNotNever<T> =
  [T] extends [never] ? false : true;


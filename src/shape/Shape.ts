import { $Data, $Fac, $Incl, $Root } from "../shapeShared";
import { IsAny, IsNever, Simplify } from "../util";
import { act, ctx, incl, root } from "./common";
import { Builder, Except, JoinPaths, World } from "./World";

export type Form<S> = Simplify<_Assemble<_Walk<S>>>;

type _Walk<O, P extends string = ''> =
  [IsNever<O>] extends [false] ?
  [IsAny<O>] extends [false] ?
    (
      _DataWalk<O, P>
    | _RootWalk<O, P>
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

type _RootWalk<O, P extends string> =
  $Root extends keyof O ?
  [JoinPaths<JoinPaths<'R', 'M'>, P>, true]
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
      nibble: root('123' as const),
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

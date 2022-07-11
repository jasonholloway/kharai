import { List } from "immutable";
import { $Data, $data, $Fac, act, ctx, SchemaNode } from "../shapeShared";
import { Simplify } from "../util";
import { Builder } from "./Builder";
import { Except, Nodes, Separator, separator } from "./common";
import { Registry } from "./Registry";

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

  const x = world(s)
  x

  type C = 14 & unknown

  type _ = [A,B,C]
}

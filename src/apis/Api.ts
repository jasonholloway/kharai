import { Narrowable, Num, Read, Str } from "../guards/Guard";

const $api = Symbol('api');


type ApiSpec = {
  [k:string]: [Narrowable?,Narrowable?]
}


export function Api<N extends ApiSpec>(n:N): Api<N> {
  return { t: $api, n };
}

export type Api<N> = {
  t: typeof $api,
  n: N
};

export type ReadServerApi<A> =
  A extends Api<infer S> ?
  { [k in keyof S]:
        S[k] extends [] ? () => void
      : S[k] extends [infer V, ...infer R] ? (
        V extends undefined
          ? (() => R extends [infer RA] ? [unknown, _ReadServerResponse<RA>] : [unknown?])
          : ((arg: Read<V>) => R extends [infer RA] ? [unknown, _ReadServerResponse<RA>] : [unknown?])
        )
      : never
  }
  : never
;

type _ReadServerResponse<A> =
  A extends Api<infer S> ?
    { [k in keyof S]:
          S[k] extends [] ? [k]
        : S[k] extends [infer H, ...infer T] ?
            T extends [infer AA]
              ? [k, Read<H>, ReadApi<AA>]
              : [k, Read<H>]
      : never
    }[keyof S]
  : Read<A>
;


export type ReadApi<A> =
  A extends Api<infer S> ?
  { [k in keyof S]:
        S[k] extends [] ? () => void
      : S[k] extends [infer V, ...infer R] ? (
        V extends undefined
          ? (() => R extends [infer RA] ? _ReadReturnApi<RA> : void)
          : ((arg: Read<V>) => R extends [infer RA] ? _ReadReturnApi<RA> : void)
        )
      : never
  }
  : never
;

type _ReadReturnApi<A> =
  A extends Api<infer S> ?
    { [k in keyof S]:
          S[k] extends [] ? [k]
        : S[k] extends [infer H, ...infer T] ?
            T extends [infer AA]
              ? [k, Read<H>, ReadApi<AA>]
              : [k, Read<H>]
      : never
    }[keyof S]
  : Read<A>
;

{
  const api = Api({
    blah: [],
    put: [Str],
    remove: [Str],
    count: [,Num],
    has: [Str, Api({
      result: [Num, Api({
        confirm: [Num]
      })],
      nope: []
    })]
  })

  type B = ReadApi<typeof api>;

  type _ = [B];
}



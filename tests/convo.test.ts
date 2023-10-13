import { Num, Read } from "../src/guards/Guard";

describe('convos', () => {

  it('bidirectional convo: simpler and more expressive', async () => {
    const [client, server] = ConvoBuilder
      .withShape(
      {
        sendNum: Convo.Send(Num, '_reply'),
        _fail: Convo.Return(),
        _ok: Convo.Return()
      },
      {
        _reply: Convo.Or(
          Convo.Send(false, '_fail'),
          Convo.Send(true, '_ok')
        )
      })
      .withServer({
        _reply() {}
      })
      .withClient({})
      .build();

    const [clientResult, serverResult] = await Promise.all([
      client.call('sendNum', 123),
      server.waitForResult()
    ]);

    expect(clientResult).toBe(1);
    expect(serverResult).toBe(2);
  })
})


namespace ConvoBuilder {

  export function withShape
    <Client extends Convo.Spec, Server extends Convo.Spec>
    (client: Client, server: Server): Given<CheckAllHandlers<Client,Server>, BuiltWithShape<Client,Server>>
  {
    //runtime check shapes match each other
    throw 1;
  }


  //each extracted next needs to exist in Other


  type Given<Check, Pass> =
    Check extends true ? Pass : Check
    ;

  type CheckAllHandlers<C, S> =
    CheckHandlers<C,S,'Server'> | CheckHandlers<S,C,'Client'>
    ;

  type CheckHandlers<Spec, Other, OtherName extends string> =
    ExtractAllNext<Spec[keyof Spec]> extends infer N
    ? N extends string
    ? (
      N extends keyof Other ? true
      : `Missing handler ${N} in ${OtherName}`
    )
    : 'Handler key must be string'
    : never
  ;

  type ExtractAllSends<T> =
    T extends Convo.Return ? never
  : T extends Convo.Send<any, any> ? T
  : T extends Convo.Or<infer R> ? ExtractAllSends<R[number]>
  : never
  ;

  type ExtractAllNext<T> =
    ExtractAllSends<T> extends infer S ?
    S extends ? Convo.Send<any, infer N> ? N
    : never : never
  ;

  namespace Tests {
    const a = Convo.Return();
    const b = Convo.Send(123, 'moo');
    const c = Convo.Or(Convo.Send(1, 'baa'), Convo.Or(Convo.Send(2, 'oink'), Convo.Send(3, 'meeow')));

    type _ = [
      
      Witness.Extends<ExtractAllNext<typeof a>, never>,
      Witness.Extends<ExtractAllNext<typeof b>, 'moo'>,
      Witness.Extends<ExtractAllNext<typeof c>, 'baa'|'oink'|'meeow'>,

      Witness.Extends<
        HandlerImpl<
          {
            send: Convo.Send<123, 'moo'>
          },
          {
            receive: Convo.Return
          }
        >,
        {
          receive(a: 123): void
        }
      >
    ];
  }



  

  export interface BuiltWithShape<C,S> {
    withServer(server: HandlerImpl<S,C>): BuiltWithServer<C,S>
  }


  type HandlerImpl<Spec,Other> =
    Digest<{ [T in (ExtractAllSends<Other[keyof Other]> extends Convo.Send<infer M, infer N> ? [M, N] : never) as T[1]]: T[0] }>
  ;

  

  type Digest<T> =
    [T] extends [infer I] ? I : never
    ;


  // work out incomings first
  // and then marry up with known response types
  //
  // so first aggregation is of incoming types per named handler
  // we want tuples of targets and types, which can then be folded together


  


  export interface BuiltWithServer<C,S> {
    withClient(client: {}): BuiltWithClient<C,S>
  }

  export interface BuiltWithClient<C,S> {
    build(): [C, S]
  }

  export interface Client {
    call(name: string, val: unknown): Promise<unknown>
  }

  export interface Server {
    waitForResult(): Promise<unknown>
  }
}


namespace Witness {
  export type Extends<U extends T, T> = U;
}


namespace Convo {



  export type Send<readonly M, N extends string> = {
    _tag: 'send',
    message: M,
    next: N
  }
  
  export function Send<T, N extends string>(send: T, next: N): Send<T,N> {
    throw 123;
  }



  export type Return {
    _tag: 'Return'
  }

  export function Return(): Return {
    throw 123;
  }




  export type Or<R extends unknown[]> = {
    _tag: 'Or'
    options: R
  };

  export function Or<R extends unknown[]>(...r: R): Or<R> {
    throw 123;
  }

  

  export function Shape<Spec extends Spec>
    (spec0: Spec, spec1: Spec): ReadConvo<Spec>
  {
      return <ReadConvo<Spec>><unknown>undefined;
  }

  export type Spec<A0 extends string = string, B0 extends string = string> = {
    [k in A0|B0]: unknown
  }

  type ReadConvo<Spec extends Spec> = Read<Spec>;

}


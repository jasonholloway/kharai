import { describe, it, expect } from "@jest/globals"
import { Num, Read } from "../src/guards/Guard";
import { Util, Witness } from "./shared";

describe('convos', () => {
  
  // N.B.
  // initial calls (without underscores!) are banned from doing Or(...)
  // which is only available on private handlers

  it('bidirectional convo 2', async () => {
    const [client, server] = ConvoBuilder
      .withShape(
      {
        send: Convo.Send('_reply', Num),
        cancel: Convo.Send('_cancel'),
        
        _fail: Convo.Return(),
        _ok: Convo.Return()
      },
      {
        _reply: Convo.Or(
          Convo.Send('_fail', false),
          Convo.Send('_ok', true)
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
    (client: Client, server: Server): Util.Given<CheckAllHandlers<Client,Server>, BuiltWithShape<Client,Server>>
  {
    //runtime check shapes match each other
    throw 1;
  }


  //each extracted next needs to exist in Other


  type CheckAllHandlers<C, S> =
    CheckHandlers<C,S,'Server'> | CheckHandlers<S,C,'Client'>
  ;

  type CheckHandlers<Spec, Other, OtherName extends string> =
    ExtractAllNext<Spec[keyof Spec]> extends infer N
    ? N extends string
    ? N extends `_${infer _}`
    ? (
      N extends keyof Other ? never
      : `Missing handler ${N} in ${OtherName}`
    )
    : `Send target ${N} doesn\'t start with underscore`
    : 'Handler key must be string'
    : never
  ;

  type ExtractAllNext<T> =
    ExtractAllSends<T> extends infer S ?
    S extends ? Convo.Send<infer N, any> ? N
    : never : never
  ;

  type ExtractAllSends<T> =
    T extends Convo.Return ? never
  : T extends Convo.Send<any, any> ? T
  : T extends Convo.Or<infer R> ? ExtractAllSends<R[number]>
  : never
  ;

  namespace Tests {
    
    const a = Convo.Return();
    const b = Convo.Send('moo');
    const c = Convo.Or(Convo.Send('baa', 123), Convo.Or(Convo.Send('oink'), Convo.Send('meeow')));

    type _ = [

      Witness.Extends<
        CheckAllHandlers<
          {
            start: Convo.Send<'_hello', true>
            _done: Convo.Return
          },
          {
            _hello: Convo.Send<'_done', true>
          }>,
        never>,

      Witness.Extends<
        CheckAllHandlers<
          {
            start: Convo.Send<'_hello', true>
            _done: Convo.Return
          },
          {
            _hello: Convo.Send<'done', true>
          }>,
        'Send target done doesn\'t start with underscore'>,
      
      Witness.Extends<ExtractAllNext<typeof a>, never>,
      Witness.Extends<ExtractAllNext<typeof b>, 'moo'>,
      Witness.Extends<ExtractAllNext<typeof c>, 'baa'|'oink'|'meeow'>,

      Witness.Extends<
        HandlerImpl<
          { send: Convo.Send<'moo', 123> },
          { receive: Convo.Return }
        >,
        [
          { receive(a: 123): void },
          { moo(): void }
        ]
      >
    ];

    type __ = _
  }


  type _Initials = 
    Convo.Send<'shoo'> | Convo.Send<'fetch'>;

  type _ClientHandlers = {
    receive: Convo.Send<'patHead'>
  };

  type _ServerHandlers = {
    shoo: Convo.Return
    fetch: Convo.Send<'receive', Slipper>
    patHead: Convo.Return
  };

  type __ = [
    HandlerImpl<_Initials,_ClientHandlers,_ServerHandlers>
    // HandlerImpl<never,_ServerHandlers,_ClientHandlers>,
  ];

  type ___ = __


  interface Slipper {}


  export interface BuiltWithShape<C,S> {
    withServer(server: HandlerImpl<S,C>): BuiltWithServer<C,S>
  }

  type Spec2Sends<Spec> =
    { [ T in Send2Tup<ExtractAllSends<Spec[keyof Spec]>> as T[0]]: T[1] }
  ;


  type HandlerImpl<InitialOther,Other,Me> =
    [{ [ T in Send2Tup<Spec2Sends<Other>|InitialOther> as T[0]]: T[1] }] extends [infer Incoming] ?
    [{ [ T in Send2Tup<Spec2Sends<Me>> as T[0]]: T[1] }] extends [infer Outgoing] ?

    {
      [k in keyof Incoming]:
      [
        k extends keyof Incoming ? Incoming[k] : void,
        k extends keyof Outgoing ? Outgoing[k] : void
      ]
    }
    
    // [Incoming, Outgoing]
    : never : never;

  //TODO need to aggregate Outgoing and combine the two formed objects into one

  //incoming are the messages other sends to me
  //outgoing are the types I will send out
  //so if 


  type Send2Tup<S> =
    S extends Convo.Send<infer N, infer M> ? readonly [N, M] : never
  ;

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


namespace Convo {
  export type Send<N extends string, readonly M = void> = {
    _tag: 'send',
    message: M,
    next: N
  }
  
  export function Send<Next extends string, Message = void>(next: Next, message: Message = undefined): Send<Next, Message> {
    throw 123;
  }

  export type Return = {
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



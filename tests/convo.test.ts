import { Num, Read } from "../src/guards/Guard";

describe('convos', () => {


  it('bidirectional convo: simpler and more expressive', () => {

    const c = Convo.Spec(
      {
        send: Convo.Send(Num, 'reply'),
        fail: Convo.Return(),
        ok: Convo.Return()
      },
      {
        reply: Convo.Or(
          Convo.Send(false, 'fail'),
          Convo.Send(true, 'ok')
        )
      }
    );
  })

})

namespace Convo {
  export function Send<T, F>(send: T, nextOther: string) { return t; };
  export function Return() {};
  export function Or<R extends unknown[]>(...r: R) {}

  export function Spec<Spec extends ConvoSpec>
    (spec0: Spec, spec1: Spec): ReadConvo<Spec>
  {
      return <ReadConvo<Spec>><unknown>undefined;
  }

  type ConvoSpec<A0 extends string = string, B0 extends string = string> = {
    [k in A0|B0]: unknown
  }

  type ReadConvo<Spec extends ConvoSpec> = Read<Spec>;

}


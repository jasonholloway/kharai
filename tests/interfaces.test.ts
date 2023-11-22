import CancellablePromise, { Cancellable } from "../src/CancellablePromise";
import { Narrowable, Num, Str } from "../src/guards/Guard";



namespace Interfaces {

  const tup = <R extends Narrowable[]>(...r: R) => r;


  export type Spec = {};

  
  export class Contract<S extends Spec> {
    //nothing actually needed in here?
  };

  export type Client<C extends Contract> = {}
  ;

  export type Server<C extends Contract> = {}
  ;

  export function Fn<I, O>(i: I, o: O): {} {
    return tup('fn', i, o);
  }


  export function spec<S extends Spec>(spec: S): Contract<S> {
    return new Contract<S>();
  }

  export function bindClient<S extends Spec>(contract: Contract<S>): Attempt<Client<C>> {
    return Attempt.fail();
  }

  export function bindServer<S extends Spec>(contract: Contract<S>): Attempt<Server<C>> {
    return Attempt.fail();
  }
}



describe('interfaces', () => {

  it('spec', () => {
    const contract = Interfaces.spec({
      sayHello: Interfaces.Fn(Str, true)
    });

    const client = Interfaces.bindClient(contract).assert();
    expect(client).toBeDefined();

    const server = Interfaces.bindServer(contract).assert();
    expect(server).toBeDefined();
  })

})







import { describe, it, expect } from "@jest/globals"
import CancellablePromise, { Cancellable } from "../src/CancellablePromise";
import { Narrowable, Num, Str } from "../src/guards/Guard";
import { Attempt } from "../src/Attempt";
import { Map } from "immutable";

namespace Interfaces {

  const tup = <R extends Narrowable[]>(...r: R) => r;


  export type Spec = {};

  
  export class Contract<S extends Spec> {
    //nothing actually needed in here?
  };

  export type Client<S extends Spec> = {}
  ;

  export type Interface<S extends Spec> = {}
  ;

  export class Server {
    private _handlers: Map<Contract<Spec>, Interface<Spec>> = Map();

    addHandler<S extends Spec>(c: Contract<S>, handler: Interface<S>): void {
      this._handlers.set(c, handler);
    }

    getHandler<S extends Spec>(c: Contract<S>): Attempt<Interface<S>> {
      return Attempt.fail();
    }
  };

  export function Fn<I, O>(i: I, o: O): {} {
    return tup('fn', i, o);
  }


  export function spec<S extends Spec>(spec: S): Contract<S> {
    return new Contract<S>();
  }


  // this itself is a negotation, ironically
  // except we are in a simpler space here:
  // the client asks the server, and the server says yes or no, providing an implementation or not
  // so... we only need bindServer!

  // export function bindClient<S extends Spec>(contract: Contract<S>): Attempt<Client<S>> {
  //   return Attempt.fail();
  // }

  export function bindToServer<S extends Spec>(contract: Contract<S>, server: Server): Attempt<Client<S>> {
    const s = server.getHandler(contract);
    //opportuniy to interject here!
    return s;
  }
}



describe('interfaces', () => {

  it('spec', () => {
    const contract = Interfaces.spec({
      sayHello: Interfaces.Fn(Str, true)
    });

    const server = new Interfaces.Server();

    server.addHandler(contract, {});

    //opens the question, what's the point (or possibility) of bind, it all it's currently doing is looking into a map?
    //contracts could have a graph...
    //but also the interpellation of middleware, instead of giving the two parties direct access to one another
    //such mediation is necessary, potentially, to track causation etc
    //or we could use the chat protocol? this would ensure causation tracking for us
    //this seems right though: we shouldn't call directly: rather we should send messages

    const client = Interfaces.bindToServer(contract, server).ok();
    expect(client).toBeDefined();
  })
})

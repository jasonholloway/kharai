import { describe, it, expect } from "@jest/globals"
import { Bool, Narrowable, Num, Read, Str, Typ } from "../src/guards/Guard";
import { Attempt } from "../src/Attempt";
import { Map } from "immutable";
import CancellablePromise from "./CancellablePromise";

namespace Interfaces {

  const tup = <R extends Narrowable[]>(...r: R) => r;


  export type Spec = {};

  
  export class Contract<S extends Spec> {
    spec:S;

    constructor(spec: S) {
      this.spec = spec;
    }
    //nothing actually needed in here?
  };

  export type Client<S extends Spec> = {
    iface: Interface<S>
  };

  export type Handler = (m:[string,unknown[]])=>unknown;

  export type Pipeline = (next: Handler) => Handler;

  // export type Transport = 

  

  export type Interface<S extends Spec> =
    {
      [k in keyof S]: ReadFn<S[k]>
    }
  ;

  type ReadFn<F> =
      F extends Typ<['fn', infer ParamGuards]>
    ? ReadFnArgs<ParamGuards> extends infer Params
    ? Params extends [...infer Args, infer Return]
    ? (...args: Args)=>Return
    : never : never : never
  ;

  type ReadFnArgs<R> =
      R extends [infer Head] ? [Read<Head>]
    : R extends [infer Head, ...infer Tail] ? [Read<Head>, ...ReadFnArgs<Tail>]
    : never
    ;

  {
    const fn = Fn(Num, Str, Bool);
    
    type R = ReadFn<typeof fn>;

    type _ = [R];
  }
  


  type ReturnTypes<R> = never; //todo

  export class Receiver<R=never> {

    constructor() {
      //should take transport here
    }

    serve<S extends Spec, Impl extends Interface<S>>(contract: Contract<S>, impl: Impl): Receiver<R|ReturnTypes<Impl>> {
      throw 123;
    }

    wait(): CancellablePromise<R> { //could be implicit
      throw 123;
    }

  }

  

  export class Server {
    private _handlers: Map<Contract<Spec>, Interface<Spec>> = Map();

    addHandler<S extends Spec>(c: Contract<S>, handler: Interface<S>): void {
      this._handlers = this._handlers.set(c, handler);
    }

    getHandler<S extends Spec>(c: Contract<S>): Attempt<Interface<S>> {
      const found = this._handlers.get(c, false);
      return found ? Attempt.succeed(<Interface<S>>found) : Attempt.fail();
    }

    waitTillNext(): CancellablePromise<unknown> {
      throw 123;
    }

    // the waiting needs to returned a well-typed response
    // so it's not just adding the handler that's needed: its the processing as well
    // OR the type of the Server needs to be built up via the builder pattern (also good)
    // in fact it has to be the latter (even if there's an implicit builder)

    // the handlers and their types need to be accumulated before anything is done with them
    // so there has to be some kind of hook at the end (possibly on the await?!)
    //
    
  };

  export function Fn<R extends unknown[]>(...params: R) {
    return new Typ(tup('fn' as const, params));
  }


  export function spec<S extends Spec>(spec: S): Contract<S> {
    return new Contract<S>(spec);
  }

  export function bindToServer<S extends Spec>(contract: Contract<S>, server: Server, pipeline: Pipeline): Attempt<Client<S>> {
    return server.getHandler(contract).map(createClient);

    function createClient(h: Interface<S>): Client<S> {
      const s = contract.spec;
      const props = Object.getOwnPropertyNames(s);




      return {
        iface: <Interface<S>>props.reduce(
          (ac, pn) => ({
            ...ac,
            [pn]: (...args: unknown[]) => {

              // this is the client proxy
              // and the pipeline should dictate what happens to the introduced messages
              // we can imagine dispatch-at-a-distance
              // which would mean the binding to the server is done indirectly
              //
              // instead of injecting just one part, that does both send and recieve
              // there should be two parts (possibly with transport inbetween...)

              
              const result = pipeline(m => {
                const handler = <Record<string, unknown|undefined>>h;
                const found = handler[m[0]];

                if(found && typeof found === 'function') {
                  return found(...m[1]);
                }
                else {
                  throw Error(`No function prop ${pn} found on handler`);
                }
              })([pn, args]);

              //need to unpack result here?
              //possibly not, actually
              //as there's no info except from the payload being returned...
              //so it can just flow as is

              return result;
            }
          }),
          {})
      }
    }
  }
}

describe('interfaces', () => {
  it('can be added and bound', async () => {
    const contract = Interfaces.spec({
      countChars: Interfaces.Fn(Str, Num)
    });

    const server = new Interfaces.Server();
    server.addHandler(contract, {
      countChars(str: string) {
        return str.length;
      }
    });

    const client = await Interfaces.bindToServer(contract, server, next=>next).ok();

    const result = client.iface.countChars('hello');
    expect(result).toBe(5);
  })



  it('can set up receiver', async () => {
    const contract = Interfaces.spec({
      countChars: Interfaces.Fn(Str, Num)
    });



    const received = await new Interfaces.Receiver()
      .serve(contract, {
        countChars(s) {
          return s.length;
        }
      })
      .wait()
    ;


  })
})

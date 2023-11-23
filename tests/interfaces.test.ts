import { describe, it, expect } from "@jest/globals"
import { Bool, Narrowable, Num, Read, Str, Typ } from "../src/guards/Guard";
import { Attempt } from "../src/Attempt";
import { Map } from "immutable";

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
  

  export class Server {
    private _handlers: Map<Contract<Spec>, Interface<Spec>> = Map();

    addHandler<S extends Spec>(c: Contract<S>, handler: Interface<S>): void {
      this._handlers = this._handlers.set(c, handler);
    }

    getHandler<S extends Spec>(c: Contract<S>): Attempt<Interface<S>> {
      const found = this._handlers.get(c, false);
      return found ? Attempt.succeed(<Interface<S>>found) : Attempt.fail();
    }
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
})

import { describe, it, expect } from "@jest/globals"
import { Bool, Narrowable, Num, Read, Str, Typ } from "../src/guards/Guard";
import { Attempt } from "../src/Attempt";
import { Map, Set } from "immutable";
import { AttendedFn } from "../src/MachineSpace";
import CancellablePromise from "../src/CancellablePromise";

const tup = <R extends Narrowable[]>(...r: R) => r;

namespace Calls {

  export type Spec = ReturnType<typeof Fn>;
  
  export class Contract<S extends Spec> {
    spec:S;

    constructor(spec: S) {
      this.spec = spec;
    }
  };

  export type Handler<S extends Spec> =
    ReadFn<S> extends { args: infer Args, ret: infer Ret }
  ? Args extends unknown[]
  ? (...args: Args)=>[unknown, Ret]
  : never : never;



  type ReadFn<F> =
      unknown extends F ? { args:unknown[], ret:unknown, fn:(...args:unknown[])=>unknown } //return type could be narrower here
    : F extends Typ<['fn', infer ArgGuards, infer RetGuard]>
    ? Read<ArgGuards> extends infer Args
    ? Args extends unknown[] 
    ? Read<RetGuard> extends infer Ret
    ? { args:Args, ret:Ret, fn:(...args:Args)=>Ret }
    : never : never : never : never
  ;


  // type ReadFnArgs<R> =
  //     R extends [infer Head] ? [Read<Head>]
  //   : R extends [infer Head, ...infer Tail] ? [Read<Head>, ...ReadFnArgs<Tail>]
  //   : never
  //   ;

  {
    const fn = Fn(tup(Num, Str), Bool);

    type R = ReadFn<typeof fn>;

    type Y = ReadFn<unknown>;

    type _ = [R, Y];
  }
  


  type ReturnTypes<R> = never; //todo

  
  export type RunReceiver<R> = (fn: AttendedFn<R>)=>Attempt<R>;

  const $bind = Symbol();
  
  export type BindCall = [typeof $bind, Contract<Spec>, unknown[]];
  export type BindReply = [typeof $bind, Contract<Spec>, unknown];

  function isBindCall(m: any): m is BindCall {
    return Array.isArray(m)
      && m.length == 3
      && m[0] === $bind
      && m[1] instanceof Contract
      && Array.isArray(m[2]);
  }

  export class Receiver<R=never> {
    private _run: RunReceiver<R>;
    private _handlers: Map<Contract<Spec>, Handler<Spec>>;

    constructor(add: RunReceiver<R>, reg: Map<Contract<Spec>, Handler<Spec>>) {
      this._run = add;
      this._handlers = reg ?? Map();
    }

    serve<S extends Spec, Impl extends Handler<S>>(contract: Contract<S>, impl: Impl): Receiver<R|ReturnTypes<Impl>> {
      return new Receiver(this._run, this._handlers.set(contract, impl));
    }

    wait(): Attempt<R> { //could be implicit
      return this._run(m => {
        if(!isBindCall(m)) return false;
        else {
          const [, contract, args] = m;

          const handler = this._handlers.get(contract, false);
          if(!handler) return false;

          const r = <[R, unknown]>handler(...args);
          //todo
          //test args here

          return r;
        }
      });
    }
  }




  export function Fn<Args extends unknown[], Return>(args: Args, ret: Return) {
    return new Typ(tup('fn' as const, args, ret));
  }


  export type Target = (m:unknown)=>Attempt<unknown>;

  export function bindAndCall<S extends Spec, F extends ReadFn<S>=ReadFn<S>>(attaching: Attempt<Target>, contract: Contract<S>, args: F['args']): Attempt<F['ret']> {
    return attaching
      .flatMap(target => target([$bind, contract, args]))
      .flatMap(r => {
        //test response here
        return Attempt.succeed(r);
      })
  }
}


describe('interfaces', () => {

  it('can set up receiver', async () => {
    const countChars = new Calls.Contract(Calls.Fn(tup(Str), Num));

    const receivers: ((m:unknown)=>Attempt<unknown>)[] = [];

    const runReceiver: Calls.RunReceiver<unknown> = fn => {
      return new Attempt(CancellablePromise.create(resolve => {
        receivers.push(m => {
          const r = fn(m, 'mid', Set())
          if(r) {
            resolve([r[0]]);
            return Attempt.succeed(r[1]);
          }
          else {
            resolve(false)
            return Attempt.fail();
          };
        });
      }));
    };

    const target: Calls.Target = m => {
      return receivers[0](m);
    };

    const receiving = new Calls.Receiver(runReceiver, Map())
      .serve(countChars, s => {
        return ['forServer', s.length];
      })
      .wait()
      .ok();

    const result = await Calls
      .bindAndCall(Attempt.succeed(target), countChars, ['woof'])
      .ok();

    const received = await receiving;

    expect(result).toBe(4);
    expect(received).toBe('forServer');
  })

  
})

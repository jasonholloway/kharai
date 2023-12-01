import { describe, it, expect } from "@jest/globals"
import { Map, Set } from "immutable";
import { Bool, Num, Read, Str, Typ } from "../src/guards/Guard";
import { Attempt } from "../src/Attempt";
import { AttendedFn } from "../src/MachineSpace";
import CancellablePromise from "../src/CancellablePromise";
import { tup } from "../src/util";
import { Witness } from "./shared.js";

describe('interfaces', () => {

  it('can set up receiver', async () => {
    const { runReceiver, target } = runChat();

    const countChars = new Calls.Contract(Calls.Fn(tup(Str), Num));

    const receiving = new Calls.Receiver(runReceiver, Map())
      .serve(countChars, s => ['forServer', s.length])
      .wait()
      .ok();

    const result = await Calls
      .bindAndCall(Attempt.succeed(target), countChars, ['woof'])
      .ok();

    const received = await receiving;

    expect(result).toBe(4);
    expect(received).toBe('forServer');
  })

  it('fails if contract not served', async () => {
    const { runReceiver, target } = runChat();

    const countChars = new Calls.Contract(Calls.Fn(tup(Str), Num));
    const sayWoof = new Calls.Contract(Calls.Fn(tup(), 'WOOF' as const));

    const receiving = new Calls.Receiver(runReceiver, Map())
      .serve(countChars, s => ['forServer', s.length])
      .wait();

    const result = await Calls
      .bindAndCall(Attempt.succeed(target), sayWoof, []);

    const received = await receiving;

    expect(result).toBe(false);
    expect(received).toBe(false);
  })

  it('can serve many contracts', async () => {
    const { runReceiver, target } = runChat();

    const countChars = new Calls.Contract(Calls.Fn(tup(Str), Num));
    const sayWoof = new Calls.Contract(Calls.Fn(tup(), 'WOOF' as const));

    const receiving = new Calls.Receiver(runReceiver, Map())
      .serve(countChars, s => ['forServer' as const, s.length])
      .serve(sayWoof, () => ['forServerAgain' as const, 'WOOF'])
      .wait()
      .ok();

    const result = await Calls
      .bindAndCall(Attempt.succeed(target), sayWoof, [])
      .ok();

    const received = await receiving;

    type _ = Witness.Extends<typeof received, 'forServer'|'forServerAgain'>;

    expect(result).toBe('WOOF');
    expect(received).toBe('forServerAgain');
  })


  function runChat() {
    const receivers: ((m:unknown)=>Attempt<unknown>)[] = [];

    const runReceiver: Calls.RunReceiver = fn => {
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

    return { runReceiver, target };
  }
})


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

  export type ReturnTypes<H> =
    H extends (...a:never[])=>[infer R, ...unknown[]]
    ? R
    : never;


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

    type H = (s:string)=>['woof',123];

    type Z = ReturnTypes<H>;

    type _ = [R, Y, Z];
  }
  


  
  export type RunReceiver = <R>(fn: AttendedFn<R>)=>Attempt<R>;

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
    private _run: RunReceiver;
    private _handlers: Map<Contract<Spec>, Handler<Spec>>;

    constructor(add: RunReceiver, reg: Map<Contract<Spec>, Handler<Spec>>) {
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

          //test args here? but types should be protected

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



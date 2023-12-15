import { Map } from "immutable";
import { Attempt } from "./Attempt";
import { Guard, Narrowable, Read } from "./guards/Guard";
import CancellablePromise from "./CancellablePromise";


export function Call<A extends unknown[],R>(args: A, ret: R): Contract<Read<A>, Read<R>> {
  return new Contract(Guard(args), Guard(ret));
}


export class Contract<Args extends unknown[]=unknown[], Ret=unknown> {
  guards: {
    args: Guard<Args>,
    ret: Guard<Ret>
  }

  constructor(args: Guard<Args>, ret: Guard<Ret>) {
    this.guards = { args, ret };
  }
};

export type ContractArgs<C extends Contract> = C extends Contract<infer Args, unknown> ? Args : never;
export type ContractRet<C extends Contract> = C extends Contract<unknown[], infer Ret> ? Ret : never;


export type Handler<C extends Contract = Contract> =
  (...args: ContractArgs<C>) => [unknown, ContractRet<C>]
;

type HandlerRet<H> =
  H extends (...a:never[])=>[infer R, ...unknown[]]
  ? R
  : never
;


export type RunReceiver = <R>(fn: (m:unknown)=>([R]|[R,unknown]|false))=>Attempt<R>;

export class Receiver<R=never> {
  private _run: RunReceiver;
  private _handlers: Map<Contract, Handler>;

  constructor(add: RunReceiver, reg: Map<Contract, Handler>) {
    this._run = add;
    this._handlers = reg ?? Map();
  }

  given<C extends Contract, H extends Handler<C>>(contract: C, handler: H): Receiver<R|HandlerRet<H>> {
    return new Receiver(this._run, this._handlers.set(contract, handler));
  }

  else<V extends Narrowable>(fallback: V): CancellablePromise<R|V> {
    return this._run(m => {
      if(!isBindCall(m)) return false;
      else {
        const [, contract, args] = m;

        //todo: should check args here - though we should be safe given the contract

        const handler = this._handlers.get(contract, false);
        if(!handler) return false;

        const [result, response] = <[R, unknown]>handler(...args);

        return [result, [$bindReply, contract, response]];
      }
    }).else(fallback);
  }
}

export type Target = (m:unknown)=>Attempt<unknown>;

export function bindAndCall<C extends Contract>(attaching: Attempt<Target>, contract: C, args: ContractArgs<C>): Attempt<ContractRet<C>> {
  return attaching
    .flatMap(target => target([$bindCall, contract, args]))
    .flatMap(r => {
      console.log('r', r)
      
      if(!isBindReply(r)) return Attempt.fail(); //todo really need reasons!
      else {
        const [, c, ret] = r;

        if(c !== contract) return Attempt.fail();

        //question here: do we actually need to use the guards? and perhaps for all contracts: if we've compared $bind, then all types should be safe...
        if(contract.guards.ret(ret)) {
          return Attempt.succeed(<ContractRet<C>>ret);
        }
        else {
          return Attempt.fail(); //really need to capture errors here
        }
      }
    })
}

const $bindCall = Symbol('bindCall');
const $bindReply = Symbol('bindReply');

type BindCall = [typeof $bindCall, Contract, unknown[]];
type BindReply = [typeof $bindReply, Contract, unknown];

function isBindCall(m: any): m is BindCall {
  return Array.isArray(m)
    && m.length == 3
    && m[0] === $bindCall
    && m[1] instanceof Contract
    && Array.isArray(m[2]);
}

function isBindReply(m: any): m is BindReply {
  return Array.isArray(m)
    && m.length == 3
    && m[0] === $bindReply
    && m[1] instanceof Contract;
}

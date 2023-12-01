import { describe, it, expect } from "@jest/globals"
import { Map, Set } from "immutable";
import { Bool, Guard, Num, Read, Str, Typ } from "../src/guards/Guard";
import { Attempt } from "../src/Attempt";
import { AttendedFn } from "../src/MachineSpace";
import CancellablePromise from "../src/CancellablePromise";
import { tup } from "../src/util";
import { Witness } from "./shared.js";
import * as SimpleCall from "../src/SimpleCall"

describe('SimpleCall', () => {

  it('can set up receiver', async () => {
    const { runReceiver, target } = runChat();

    const countChars = SimpleCall.Contract.create(tup(Str), Num);

    const receiving = new SimpleCall.Receiver(runReceiver, Map())
      .serve(countChars, s => ['forServer', s.length])
      .wait()
      .ok();

    const result = await SimpleCall
      .bindAndCall(Attempt.succeed(target), countChars, ['woof'])
      .ok();

    const received = await receiving;

    expect(result).toBe(4);
    expect(received).toBe('forServer');
  })

  it('fails if contract not served', async () => {
    const { runReceiver, target } = runChat();

    const countChars = SimpleCall.Contract.create(tup(Str), Num);
    const sayWoof = SimpleCall.Contract.create(tup(), 'WOOF' as const);

    const receiving = new SimpleCall.Receiver(runReceiver, Map())
      .serve(countChars, s => ['forServer', s.length])
      .wait();

    const result = await SimpleCall
      .bindAndCall(Attempt.succeed(target), sayWoof, []);

    const received = await receiving;

    expect(result).toBe(false);
    expect(received).toBe(false);
  })

  it('can serve many contracts', async () => {
    const { runReceiver, target } = runChat();

    const countChars = SimpleCall.Contract.create(tup(Str), Num);
    const sayWoof = SimpleCall.Contract.create(tup(), 'WOOF' as const);

    const receiving = new SimpleCall.Receiver(runReceiver, Map())
      .serve(countChars, s => ['forServer' as const, s.length])
      .serve(sayWoof, () => ['forServerAgain' as const, 'WOOF'])
      .wait()
      .ok();

    const result = await SimpleCall
      .bindAndCall(Attempt.succeed(target), sayWoof, [])
      .ok();

    const received = await receiving;

    type _ = Witness.Extends<typeof received, 'forServer'|'forServerAgain'>;

    expect(result).toBe('WOOF');
    expect(received).toBe('forServerAgain');
  })


  function runChat() {
    const receivers: ((m:unknown)=>Attempt<unknown>)[] = [];

    const runReceiver: SimpleCall.RunReceiver = fn => {
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

    const target: SimpleCall.Target = m => {
      return receivers[0](m);
    };

    return { runReceiver, target };
  }
})


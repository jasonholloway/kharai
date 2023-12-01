import { describe, it, expect } from "@jest/globals"
import { Map } from "immutable";
import { Num, Str } from "../src/guards/Guard";
import { Attempt } from "../src/Attempt";
import CancellablePromise from "../src/CancellablePromise";
import { tup } from "../src/util";
import { Witness } from "./shared.js";
import { Call, Receiver, bindAndCall, RunReceiver, Target } from "../src/SimpleCall"

describe('SimpleCall', () => {

  it('can set up receiver', async () => {
    const { runReceiver, target } = runChat();

    const countChars = Call(tup(Str), Num);

    const receiving = new Receiver(runReceiver, Map())
      .given(countChars, s => ['forServer', s.length])
      .else(false);

    const result = await bindAndCall(Attempt.succeed(target), countChars, ['woof']).ok();

    const received = await receiving;

    expect(result).toBe(4);
    expect(received).toBe('forServer');
  })

  it('fails if contract not served', async () => {
    const { runReceiver, target } = runChat();

    const countChars = Call(tup(Str), Num);
    const sayWoof = Call(tup(), 'WOOF' as const);

    const receiving = new Receiver(runReceiver, Map())
      .given(countChars, s => ['forServer', s.length])
      .else(false);

    const result = await bindAndCall(Attempt.succeed(target), sayWoof, []);

    const received = await receiving;

    expect(result).toBe(false);
    expect(received).toBe(false);
  })

  it('can serve many contracts', async () => {
    const { runReceiver, target } = runChat();

    const countChars = Call(tup(Str), Num);
    const sayWoof = Call(tup(), 'WOOF' as const);

    const receiving = new Receiver(runReceiver, Map())
      .given(countChars, s => ['forServer' as const, s.length])
      .given(sayWoof, () => ['forServerAgain' as const, 'WOOF'])
      .else(false);

    const result = await bindAndCall(Attempt.succeed(target), sayWoof, []).ok();

    const received = await receiving;

    type _ = Witness.Extends<typeof received, 'forServer'|'forServerAgain'|false>;

    expect(result).toBe('WOOF');
    expect(received).toBe('forServerAgain');
  })


  function runChat() {
    const receivers: ((m:unknown)=>Attempt<unknown>)[] = [];

    const runReceiver: RunReceiver = fn => {
      return new Attempt(CancellablePromise.create(resolve => {
        receivers.push(m => {
          const r = fn(m)
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

    const target: Target = m => {
      return receivers[0](m);
    };

    return { runReceiver, target };
  }
})


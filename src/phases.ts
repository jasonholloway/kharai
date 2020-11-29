import { Id, World, PhaseImpl, MachineContext, Phase } from "./lib";
import { delay } from "./util";

export const bootPhase = <W extends World>(): PhaseImpl<W, MachineContext, []> =>
  (x => ({
    guard(_: any): _ is [] { return true },
    async run() {
      while(true) {
        const answer = await x.attach<Phase<W>>({
          chat(c) { return c; } //should be checking this here...
        });

        if(answer) {
          return answer[0];
        }
        else {
          await delay(30); //when we release properly, this can be removed TODO
        }
      }
    }
  }));

export const endPhase = <W extends World>(): PhaseImpl<W, MachineContext, [any]> =>
  (x => ({
    guard(d: any): d is [any] { return true },
    async run() { return false as const; }
  }));

export const waitPhase = <W extends World>(): PhaseImpl<W, MachineContext, [number, Phase<W>]> =>
  (x => ({
    guard(d: any): d is [number, Phase<W>] { return true },
    async run([delay, next]) {
      return next;
    }
  }));

export const watchPhase = <W extends World>(): PhaseImpl<W, MachineContext, [Id, string, Phase<W>]> =>
  (x => ({
    guard(d: any): d is [Id, string, Phase<W>] { return true },
    async run([id, pred, next]) {
      return next;
    }
  }));

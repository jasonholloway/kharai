import { Id, World, PhaseImpl, MachineContext, Phase } from "./lib";
import { delay } from "./util";

//TODO
//maybe P could be parameterised below...

export const bootPhase = <W extends World, P>(): PhaseImpl<W, MachineContext<P>, []> =>
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

export const endPhase = <W extends World, P>(): PhaseImpl<W, MachineContext<P>, [any]> =>
  (x => ({
    guard(d: any): d is [any] { return true },
    async run() { return false as const; }
  }));


//NOTE ***
//below derive P for themselves
//might not match the parameterised P approach elsewhere

export const waitPhase = <W extends World, P extends Phase<W>>(): PhaseImpl<W, MachineContext<P>, [number, P]> =>
  (x => ({
    guard(d: any): d is [number, P] { return true },
    async run([delay, next]) {
      return next;
    }
  }));

export const watchPhase = <W extends World, P extends Phase<W>>(): PhaseImpl<W, MachineContext<P>, [Id, string, P]> =>
  (x => ({
    guard(d: any): d is [Id, string, P] { return true },
    async run([id, pred, next]) {
      return next;
    }
  }));

//W decides everything

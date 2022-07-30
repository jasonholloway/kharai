import { Id, World, PhaseImpl, MachineContext, _Phase } from "./lib";
import { delay } from "./util";

//TODO
//maybe P could be parameterised below...

export const bootPhase = <P>(): PhaseImpl<P, MachineContext<P>, []> =>
  (x => ({
    guard(_: any): _ is [] { return true },
    async run() {
      while(true) {
        const answer = await x.attach<P>({
          receive(c) { return c; } //should be checking this here...
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

export const endPhase = <P>(): PhaseImpl<P, MachineContext<P>, [any]> =>
  (x => ({
    guard(d: any): d is [any] { return true },
    async run() { return false as const; }
  }));


//NOTE ***
//below derive P for themselves
//might not match the parameterised P approach elsewhere

export const waitPhase = <P>(): PhaseImpl<P, MachineContext<P>, [number, P]> =>
  (x => ({
    guard(d: any): d is [number, P] { return true },
    async run([ms, next]) {
      await delay(ms);
      return next;
    }
  }));

export const watchPhase = <P>(): PhaseImpl<P, MachineContext<P>, [Id, string, P]> =>
  (x => ({
    guard(d: any): d is [Id, string, P] { return true },
    async run([id, pred, next]) {
      return next;
    }
  }));

//W decides everything

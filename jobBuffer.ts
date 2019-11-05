import Heap from 'heap'
import { setTimeout } from 'timers';

export default class JobBuffer<V> {

    private heap: Heap<V>;

    constructor(quantify: (v: V) => number) {
        this.heap = new Heap<V>((a, b) => quantify(a) - quantify(b))
    }

    enqueue(v: V) {
        this.heap.insert(v);

        const timeout = setTimeout(() => {}, 1000);

        //maybe we can just set timeouts
        //a phase is scheduled: we set a timeout for that precise time
        //each machine will only have one timeout in progress at once

        //then, whether we like it or not, it executes
        //i'm not so keen about this
        //and at every reschedule point there's a chance to pull the plug, save or whatever
        
        //if a phase returns 'save' we want to save as quickly as poss
        //but we also want to continue with our execution
        //so the state at the time of rescheduling is captured
        //and saved while the rest of the world goes on

        //whenever the timeout fires, some orchestration code fires first
        //so it's not blind execution

        //in the first instance, we fire all machines off
        //though there's a first-class distinction between waiting for a condition
        //and waiting for a due time - ie a distinction between a conditional phase and a normal phase
        //though maybe all phases are conditional, but defaulting to (=> true)

        //when first loading the machines, one may be only just due
        //and another may be days old
        //in which case, how do we handle a condition set by the latter?

    }

}


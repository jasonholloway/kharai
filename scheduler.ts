/// <reference path="types.d.ts" />
import FlatQueue from 'flatqueue'
import { RunContext } from './runner';

export type Job = {
    due: number,
    run: () => void | Promise<void>
}

const createScheduler = (run: RunContext) => {
    let heap = new FlatQueue<Job>();
    let waiter: NodeJS.Timeout
    let go = true;

    let onComplete: () => void, onError: (err: any) => void;
    const complete = new Promise((...args) => [onComplete, onError] = args);

    run.events.once('cancel', () => {
        console.debug('scheduler:cancel')
        go = false;
        clearTimeout(waiter);
        onComplete();
    })

    //we've got a slight problem here
    //in that jobs can decide to not reschedule themselves because of lack of time
    //(or maybe the scheduler itself should decide this)
    //the scheduler has to be able to complete /ahead of time/
    //it will do this if there's nothing worthwhile to do
    //no in flight job, basically - this requires it to keep trackof what jobs are in flight
    //which currently it does not do
    //as is, the execution will always go as far as a timeout... which is very wasteful if our work is sparse, as it is

    const fire = () => {
        try {
            if(go) {
                const job = heap.peekValue();
                heap.pop();

                job.run();

                if(heap.length) {
                    refire(-heap.peek());
                }
            }
        } 
        catch(err) {
            go = false;
            clearTimeout(waiter);
            onError(err);
        }
    }

    const refire = (due: number) => {
        const delay = due - Date.now();
        console.debug(`refire in ${delay}ms; timeout in ${run.timeout - Date.now()}ms`);

        clearTimeout(waiter);
        waiter = setTimeout(fire, delay);
    }

    return {
        add(job: Job) {
            if(go) {
                const due = job.due;

                heap.push(-due, job);

                const isNext = heap.peekValue() === job;
                if(isNext) refire(due);
            }
        },
        complete
    }
}

export type Scheduler = ReturnType<typeof createScheduler>

export default createScheduler

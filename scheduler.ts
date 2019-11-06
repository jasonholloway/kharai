/// <reference path="types.d.ts" />
import FlatQueue from 'flatqueue'
import { RunContext } from './runner';

export type Schedulable = {
    due: number,
    run: () => void
}

const createScheduler = (run: RunContext) => {
    let heap = new FlatQueue<Schedulable>();
    let waiter: NodeJS.Timeout
    let go = true;

    const wait = (due: number) => {
        const delay = due - Date.now();
        console.debug(`scheduler: refire in ${delay}ms`);

        clearTimeout(waiter);
        waiter = setTimeout(fire, delay);
    }

    const fire = () => {
        try {
            if(go) {
                const job = heap.peekValue();
                heap.pop();

                job.run();

                if(heap.length) {
                    wait(-heap.peek());
                }
            }
        } 
        catch(err) {
            go = false;
            clearTimeout(waiter);
            run.sink(err);
        }
    }

    return {
        add(job: Schedulable) {
            if(!go) return false;

            const due = job.due;

            heap.push(-due, job);

            const isNext = heap.peekValue() === job;
            if(isNext) wait(due);

            return true;
        },
        close() {
            go = false;
            clearTimeout(waiter);
            console.debug('scheduler: close')
        }
    }
}

export type Scheduler = ReturnType<typeof createScheduler>
export default createScheduler

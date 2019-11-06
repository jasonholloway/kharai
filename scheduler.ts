import FastPriorityQueue from 'fastpriorityqueue'

export type Schedulable = {
    due: number,
    do: () => void
}

const createScheduler = (sink: (e: any) => void) => {
    let waiter: NodeJS.Timeout
    let heap = new FastPriorityQueue<Schedulable>((a, b) => a.due < b.due);
    let go = true;

    const log = (...args: any[]) => console.debug('scheduler:', ...args)

    const wait = (due: number) => {
        const delay = due - Date.now();
        log(`wait ${delay}ms`);

        clearTimeout(waiter);
        waiter = setTimeout(fire, delay);
    }

    const fire = () => {
        log('fire');
        try {
            if(go) {
                const job = heap.poll()!;

                job.do();

                if(go && heap.size) {
                    wait(heap.peek()!.due);
                }
            }
        } 
        catch(err) {
            go = false;
            clearTimeout(waiter);
            sink(err);
        }
    }

    return {
        add(job: Schedulable) {
            if(go) {
                const due = job.due;

                heap.add(job);

                const isNext = heap.peek() === job;
                if(isNext) wait(due);

                return true;
            } 
            return false;
        },
        close() {
            log('close');
            go = false;
            clearTimeout(waiter);
        }
    }
}

export type Scheduler = ReturnType<typeof createScheduler>
export default createScheduler

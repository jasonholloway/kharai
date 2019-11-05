import FlatQueue from 'flatqueue'

export type Job = {
    due: number,
    run: () => void
}

export default () => {
    let heap = new FlatQueue<Job>();
    let waiter: NodeJS.Timeout

    const fire = () => {
        const job = heap.peekValue();
        heap.pop();

        try {
            job.run();
        }
        catch {
            //...
        }

        const now = Date.now();
        const due = -heap.peek();
        waiter = setTimeout(fire, now - due);
    }

    return {
        add(job: Job) {
            const due = job.due;

            heap.push(-due, job);

            const isNext = heap.peekValue() === job;
            if(isNext) {
                clearTimeout(waiter);
                waiter = setTimeout(fire, Date.now() - due);
            }
        }
    }
}

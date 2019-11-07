import { Scheduler } from './scheduler'

export type Threadable = {
    due: number,
    do(): Promise<number|false>
}

const createThreader = (scheduler: Scheduler) => {

    const log = (...args: any[]) => console.debug('threader:', ...args)

    const threads = [] as Promise<void>[];
    let go = true;

    const schedule = (job: Threadable, onComplete: () => void, onError: (e: any) => void) => 
        scheduler.add({
            due: job.due,
            do() {
                try {
                    job.do().then(result => {
                        if(result === false) {
                            onComplete();
                        }
                        else {
                            job.due = result;
                            schedule(job, onComplete, onError);
                        }
                    })
                    .catch(onError)
                }
                catch(err) {
                    onError(err)
                }
            } 
        }) || onComplete();

    return {
        add(job: Threadable) {
            if(go) {
                threads.push(
                    new Promise((resolve, reject) => {
                        schedule(job, resolve, reject) 
                    })
                    .then(() => log('done', job)))
            }
        },

        complete() {
            go = false;
            return Promise.all(threads);
        }
    }
}

export type Threader = ReturnType<typeof createThreader>
export default createThreader
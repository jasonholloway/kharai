import { Scheduler } from './scheduler'

export type Threadable = {
    due: number,
    run(): Promise<number|false>
}

const createThreader = (scheduler: Scheduler) => {
    const threads = [] as Promise<void>[];
    let go = true;

    const schedule = (job: Threadable, onComplete: () => void, onError: (e: any) => void) => 
        scheduler.add({
            due: job.due,
            run() {
                job.run()
                    .then(res => {
                        if(res === false) {
                            onComplete();
                        }
                        else {
                            job.due = res;
                            schedule(job, onComplete, onError);
                        }
                    })
                    .catch(onError)
            } 
        }) || onComplete();

    return {
        add(job: Threadable) {
            if(go) {
                threads.push(new Promise((resolve, reject) => {
                    schedule(job, resolve, reject) 
                }))
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
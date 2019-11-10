
export type Resume = Promise<boolean>

export type Threadable = {
    name: string,
    resume: Resume,
    do: () => Resume
}

const log = (...args: any[]) => console.debug('threader:', ...args)

const createThreader = () => {
    const threads = [] as Promise<void>[];
    let go = true;

    const thread = (job: Threadable): Promise<void> =>
        job.resume
            .then(cont => { //once a thread is going, only it itself will quit itself
                log('resume', job.name, cont)
                if(cont) {
                    const resume = job.do();
                    return thread({ ...job, resume });
                }
            })

    return {
        add(job: Threadable) {
            if(go) {
                threads.push(
                    thread(job) 
                        .then(() => log('end', job.name))
                    )
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

export type Resume = Promise<boolean>

export type Threadable = {
    name: string,
    resume: Resume,
    do: () => Resume
}

const log = (...args: any[]) => console.debug('threader:', ...args)

const createThreader = () => {
    const threads = [] as Promise<void>[];
    let allowAdditions = true;

    const thread = (job: Threadable): Promise<void> => {
        log('waiting to resume', job.name);
        return job.resume
            .then(cont => { //once a thread is going, only it itself will quit itself
                if(cont) {
                    log('doing', job.name)
                    const resume = job.do();
                    return thread({ ...job, resume });
                }
                else {
                    log('finishing', job.name)
                }
            })
    }

    return {
        add(job: Threadable) {
            log('adding', job.name)
            if(allowAdditions) {
                threads.push(
                    thread(job) 
                        .then(() => log('end', job.name))
                    )
            }
        },

        complete() {
            log('completing')
            allowAdditions = false;
            return Promise.all(threads);
        }
    }
}

export type Threader = ReturnType<typeof createThreader>
export default createThreader
import createMeetup from './meetup'
import { Config } from './config'
import { S3 } from 'aws-sdk'
import { promisify, isString } from './util';
import { MachineState } from './runner';

export type Context = { 
    readonly id: string, 
    readonly version: number,  
    data: any 
}

export type Binder<P> = { 
    bindAction: (phase?: string) => Action<P> 
}

export type Result<P> = Readonly<{
    state: MachineState, //somehow constrain phase here
    save?: boolean
}>

export type Next<P> = (x: Context) => Result<P>

const next = <P extends string>(then: P, save?: boolean): Next<P> =>
    x => ({ 
        state: {
            phase: then, 
            due: 0, 
            data: x.data, 
        },
        save 
    })

const delay = <P extends string>(ms: number, then: P, save?: boolean): Next<P> =>
    x => ({ 
        state: {
            phase: then, 
            due: Date.now() + Math.max(0, ms), 
            data: x.data,
        },
        save 
    })

const watch = <P extends string>(targets: string[], condition: string, then: P, save?: boolean): Next<P> =>
    x => ({ 
        state: {
            phase: then, 
            due: 0,
            watch: [targets, condition] as const,
            data: x.data,
        },
        save 
    })

type Behaviour<P> = (x: Context) => Next<P> | Promise<Next<P>>
type Action<P> = (x: Context) => Promise<Next<P>>


function specify<S extends { [key: string]: Behaviour<keyof S> }>(s: S) : Binder<keyof S> {
    return { 
        bindAction: (phase?: string) => 
            (x: Context) => promisify(s[phase || ''](x))
     };
}

const createSpec = (config: Config, s3: S3) => 
    specify({

        async downloadMembers(x) {
            const meetup = createMeetup(config, s3)

            if(!isString(x.data.memberCookie)) {
                return next('refreshCookie')
            }

            await meetup.getMembers(x.data.memberCookie); //should return code if cookie bad

            x.data.blobId++; //this should match what's actually been saved

            //blobs should be saved by monotonic id, with metadata indicating date
            //then the simple cursor value can be used to collect them all

            //the blob client should have a cache such that in the best case, we don't need to re-read
            //and the diffing can be done quickly
            //this means we do need to store the data in memory - but this isn't much really

            return delay(1000 * 60 * 60, 'downloadMembers', true)
        },

        async refreshCookie(x) {
            const { lastLoginAttempt } = x.data; 

            if(lastLoginAttempt && Date.now() < (lastLoginAttempt + (1000 * 60 * 60))) {
                return delay(Date.now() + (1000 * 60 * 60), 'refreshCookie');
            }
            else {
                const meetup = createMeetup(config, s3)
                
                const cookie = await meetup.getCookie(); //and failure???
                console.log('cookie', cookie);

                x.data.memberCookie = cookie;

                return next('downloadMembers', true)
            }
        },


        ////////////////////////////////////////////////////////////////


        start() {
            return next('waitForNewMembers')
        },

        waitForNewMembers(x) {
            return watch(['memberFetcher'], `m.state.data.blobId > ${x.data.cursor}`, 'processNewMembers');
        },

        processNewMembers(x) {
            console.log('*** HELLO JASON ***');

            x.data.cursor++;
            return next('waitForNewMembers')
        }
    });

export default createSpec
export type Spec = ReturnType<typeof createSpec>
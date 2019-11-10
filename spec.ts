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

        start() {
            return next('downloadMembers')
        },

        async downloadMembers(x) {
            const meetup = createMeetup(config, s3)

            if(!isString(x.data.memberCookie)) {
                return next('refreshCookie')
            }

            await meetup.getMembers(x.data.memberCookie); //should return code if cookie bad

            x.data.blobId++; //this should match what's actually been saved

            return delay(1000 * 60 * 60, 'downloadMembers', true)
        },

        async refreshCookie(x) {
            //should guard against doing this too often here
            //when was last cookie sought?

            const meetup = createMeetup(config, s3)
            
            const cookie = await meetup.getCookie(); //and failure???
            console.log('cookie', cookie);

            x.data.memberCookie = cookie;

            return next('downloadMembers', true)
        },

        ////////////////////////////////////////////////////////////////


        watchForDownload(x) {
            return watch(['meetupDownloader'], 'y.version > x.data.cursor', 'aha')
        },

        aha(x) {
            //should be able to read other's data here, as captured
            x.data.cursor++;
            console.log('TOOT')
            return next('watchForDownload');
        },

    });

    //
    // on error, we should try to save what we have
    // which differentiates errors into two kinds: drastic and behavioural
    //

    // Run:
    //   LoadState |>
    //     | Cookie ->
    //         DownloadCsv |> 
    //           | Success -> UploadCsv; Run
    //           | Fail -> ClearCookie; Run
    //     | None -> 
    //         Login |>
    //           | Success -> SaveCookie; Run
    //           | Fail -> Run
    //
    // a loop of four paths, one common root, branching according to loaded state
    // this is all so neat, except for the problem of controlling our delay
    // we need a way to self-schedule our resumptions
    // if the program were endlessly active obviously this would be easy
    //
    //

export default createSpec
export type Spec = ReturnType<typeof createSpec>
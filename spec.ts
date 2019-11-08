import createMeetup from './meetup'
import { Config } from './config'
import { S3 } from 'aws-sdk'
import { promisify, isString } from './util';

export type Context = { 
    readonly id: string, 
    readonly version: number,  
    data: any 
}

export type Binder<P> = { 
    bindAction: (phase?: string) => Action<P> 
}

type Next<P> = 
    P | readonly [P, number] 
    | { next: P, delay?: number, save?: boolean } 
    | { next: P, watch: readonly [string, string] }

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

            console.log('data', x.data)
            console.log('typeof memberCookie', typeof x.data.memberCookie)

            if(!isString(x.data.memberCookie)) {
                return 'refreshCookie';
            }

            await meetup.getMembers(x.data.memberCookie); //should return code if cookie bad

            x.data.blobId++; //this should match what's actually been saved

            return {
                save: true,
                delay: 1000 * 60 * 60 * 1,
                next: 'downloadMembers', 
            } as const
        },

        async refreshCookie(x) {
            //should guard against doing this too often here
            //when was last cookie sought?

            const meetup = createMeetup(config, s3)
            
            const cookie = await meetup.getCookie(); //and failure???
            console.log('cookie', cookie);

            x.data.memberCookie = cookie;

            return { 
                save: true ,
                next: 'downloadMembers', 
            } as const
        },

        ////////////////////////////////////////////////////////////////

        watchForDownload(x) {
            return {
                watch: ['meetupDownloader', `y => y.version > ${x.data.cursor}`],
                next: 'aha'
            }
        },

        aha(x) {
            //should be able to read other's data here, as captured
            x.data.cursor++;
            console.log('TOOT')
            return 'watchForDownload'
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
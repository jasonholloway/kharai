import createMeetup from './meetup'
import { Config } from './config';

export type Context = { 
    readonly id: string, 
    readonly version: number,  
    data: any 
}

export type Binder = { 
    bindAction: (phase?: string) => Behaviour<any> 
}

type Next<P> = P | readonly [P, number] | { next: P, delay?: number, save?: boolean }
type Behaviour<P> = (x: Context) => Next<P> | Promise<Next<P>>

function specify<S extends { [key: string]: Behaviour<keyof S> }>(s: S) : Binder {
    return { 
        bindAction: (phase?: string) => s[phase || '']
     };
}

const isString = (v: any): v is string =>
    typeof v === 'string';


export default (config: Config) => 
    specify({
        start() {
            return 'downloadMembers'
        },

        async downloadMembers(x) {
            const meetup = createMeetup(config)

            console.log('data', x.data)
            console.log('typeof memberCookie', typeof x.data.memberCookie)

            if(!isString(x.data.memberCookie)) {
                return 'refreshCookie';
            }

            await meetup.getMembers(x.data.memberCookie); //should return code if cookie bad

            return {
                next: 'downloadMembers', 
                delay: 1000 * 60 * 60 * 1,
                save: true
            } as const
        },

        async refreshCookie(x) {
            //should guard against doing this too often here
            //when was last cookie sought?

            const meetup = createMeetup(config)
            
            const cookie = await meetup.getCookie(); //and failure???
            console.log('cookie', cookie);

            x.data.memberCookie = cookie;

            return { 
                next: 'downloadMembers', 
                save: true 
            } as const
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
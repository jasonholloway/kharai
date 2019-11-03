import createMeetup from './meetup'
import { Config } from './config';

export type Context = { version: Readonly<number>,  data: any }
export type Spec = { match: (phase?: string) => Behaviour<any> }

type Next<P> = P | readonly [P, number] | { next: P, delay?: number, save?: boolean }
type Behaviour<P> = (x: Context) => Next<P> | Promise<Next<P>>

function specify<S extends { [key: string]: Behaviour<keyof S> }>(s: S) : Spec {
    return { 
        match: (phase?: string) => s[phase || '']
     };
}

export default (config: Config) => 
    specify({
        start() {
            return 'downloadMembers'
        },

        async downloadMembers(x) {
            const meetup = createMeetup(config)

            console.log('data', x.data)
            console.log('typeof memberCookie', typeof x.data.memberCookie)

            if(typeof x.data.memberCookie !== 'string') {
                return 'refreshCookie';
            }

            await meetup.getMembers(x.data.memberCookie); //should return code if cookie bad

            return {
                next: 'start', 
                delay: 1000 * 60 * 60 * 1
            } as const
        },

        async refreshCookie(x) {
            //should guard against doing this too often here
            //when was last cookie sought?

            const meetup = createMeetup(config)
            
            const cookie = await meetup.getCookie();
            console.log('cookie', cookie);

            x.data.memberCookie = cookie;

            return { 
                next: 'downloadMembers', 
                save: true 
            } as const
        },
    });

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
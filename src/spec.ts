import createMeetup from './behaviour/meetup'
import { Config } from './config'
import { promisify, isString } from './util';
import { BlobStore } from './blobStore';
import { diffMembers } from './behaviour/members'
import { MachineState } from './MachineStore';
import { DynamoDB } from 'aws-sdk';

export type Context = { 
    readonly id: string, 
    readonly version: number,  
    data: any 
}

export type Binder<P> = { 
    bindAction: (phase?: string) => Action<P> 
}

export type Result = Readonly<{
    state: MachineState, //somehow constrain phase here
    save?: boolean
}>

export type Next<P> = (x: Context) => Result

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

const createSpec = (config: Config, blobs: BlobStore, dynamo: DynamoDB) => 
    specify({

        async downloadMembers(x) {
            const meetup = createMeetup(config, blobs)

            if(!isString(x.data.memberCookie)) {
                return next('refreshCookie')
            }

            x.data.lastBlob = x.data.lastBlob || 0;

            await meetup.getMembers(
                x.data.memberCookie, 
                ++x.data.lastBlob); //should return code if cookie bad

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
                const meetup = createMeetup(config, blobs)
                
                const cookie = await meetup.getCookie(); //and failure???
                console.log('cookie', cookie);

                x.data.memberCookie = cookie;

                return next('downloadMembers', true)
            }
        },


        ////////////////////////////////////////////////////////////////


        start() {
            return next('watchFiles')
        },

        watchFiles(x) {
            return watch(['memberFetcher'], `m.state.data.lastBlob > ${x.data.fileCursor || 0}`, 'diffFiles');
        },

        async diffFiles(x) {
            x.data.fileCursor = x.data.fileCursor || 0;
            x.data.updateCursor = x.data.updateCursor || 0;
            x.data.logCursor = x.data.logCursor || 0;

            const toKey = (n: number) => `dnn/members/${n.toString().padStart(6, '0')}`;

            const updates = await diffMembers(
                blobs.load(toKey(x.data.fileCursor)),
                blobs.load(toKey(x.data.fileCursor + 1))
            );

            console.log('UPDATES:', updates);

            if(updates.length) {
                const toSave = updates.slice(x.data.updateCursor, 25);
                console.log('toSave', toSave.length);

                const res = await dynamo.batchWriteItem({ 
                    RequestItems: {
                        [config.tableName]: toSave.map((u, i) => ({
                            PutRequest: {
                                Item: {
                                    part: { S: `event-${x.data.logCursor + i}` },
                                    type: { S: u.type },
                                    data: { S: JSON.stringify(u) }
                                }
                            }
                        }))
                    } 
                }).promise();

                const savedCount = toSave.length - Object.entries((res.UnprocessedItems || {})[config.tableName] || {}).length;
                x.data.updateCursor += savedCount;
                x.data.logCursor += savedCount;

                if(x.data.updateCursor >= updates.length) {
                    x.data.fileCursor++;
                    x.data.updateCursor = 0;
                }
            }
            else {
                x.data.fileCursor++;
            }

            return next('watchFiles', true);
        }
    });

export default createSpec
export type Spec = ReturnType<typeof createSpec>
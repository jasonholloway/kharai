import createMeetup from './behaviour/meetup'
import { Config } from './config'
import { promisify, isString } from './util';
import { BlobStore } from './blobStore';
import { diffMembers } from './behaviour/members'
import { MachineState } from './MachineStore';
import { DynamoDB } from 'aws-sdk';
import { Readable } from 'stream';
import toReadableStream = require('to-readable-stream');

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

            await meetup.getMembers(
                x.data.memberCookie, 
                x.data.fileCursor); //should return code if cookie bad

            x.data.fileCursor++;

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
            return watch(['membersFetcher'], `m.state.data.fileCursor > ${x.data.fileCursor || 0}`, 'diffFiles');
        },

        async diffFiles({ data: d }) {
            d.fileCursor = d.fileCursor || 0;
            d.updateCursor = d.updateCursor || 0;
            d.logCursor = d.logCursor || 0;

            const toKey = (n: number) => `members/${n.toString().padStart(6, '0')}`;

            const updates = Array.from(
                await diffMembers(
                    d.fileCursor > 0 ? blobs.load(toKey(d.fileCursor - 1)) : emptyStream(),
                    blobs.load(toKey(d.fileCursor))
                ))
                .map(u => [<number>d.fileCursor, ...u] as const);

            console.log('diffFiles: updateCursor:', d.updateCursor);

            const toSave = updates.slice(d.updateCursor, d.updateCursor + 25)
            console.log('diffFiles: toSave', toSave);

            if(toSave.length) {
                const res = await dynamo.batchWriteItem({ 
                    RequestItems: {
                        [config.tableName]: toSave.map((u, i) => ({
                            PutRequest: {
                                Item: {
                                    part: { S: `membersLog` },
                                    sort: { S: (<number>d.logCursor + i).toString(16).padStart(6, '0') },
                                    data: { S: JSON.stringify(u) }
                                }
                            }
                        }))
                    } 
                }).promise();

                const savedCount = toSave.length - Object.entries((res.UnprocessedItems || {})[config.tableName] || {}).length;
                console.log('diffFiles: saved', savedCount);

                d.updateCursor += savedCount;
                d.logCursor += savedCount;

                if(d.updateCursor >= updates.length) {
                    d.fileCursor++;
                    d.updateCursor = 0;
                }
            }
            else {
                d.fileCursor++;
                d.updateCursor = 0;
            }

            return next('watchFiles');
        }
    });

function emptyStream(): Readable {
    return toReadableStream(new Buffer(0)); 
}

export default createSpec
export type Spec = ReturnType<typeof createSpec>
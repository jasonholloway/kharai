import S3 = require("aws-sdk/clients/s3");
import { Config } from "./config";
import { Readable, PassThrough } from "stream";
import pify from 'pify';
import toReadableStream from 'to-readable-stream'
import fs from 'fs'
const WriteStreamAtomic = require('fs-write-stream-atomic');
const streamToBuffer = require('fast-stream-to-buffer');
const ReadableClone = require('readable-stream-clone');

const log = (...args: any[]) => console.log('blobs', ...args); 

const createBlobStore = (config: Config, s3: S3) => {
    const cache: { [key: string]: Buffer } = {};

    return {
        load(key: string): Readable {
            if(cache[key]) return toReadableStream(cache[key]);

            const sink = new PassThrough();
            const fileName = key.replace(/\//g, '_')

            fs.exists(`/tmp/blobs/${fileName}`, found => {
                if(found) {
                    log('createReadStream')
                    fs.createReadStream(`/tmp/blobs/${fileName}`).pipe(sink);
                }
                else {
                    fs.mkdir('/tmp/blobs', { recursive: true }, (err) => {
                        new ReadableClone(sink)
                            .pipe(new WriteStreamAtomic(`/tmp/blobs/${fileName}`))

                        s3.getObject({
                            Bucket: config.s3Bucket,
                            Key: key,
                        }).createReadStream().pipe(sink);
                    })
                }
            });

            streamToBuffer(new ReadableClone(sink), (err: any, buffer: Buffer) => {
                cache[key] = buffer;
            })

            return new ReadableClone(sink);
        },
        async save(key: string, body: Readable): Promise<Buffer> {
            const [_, buffer] = await Promise.all([
                s3.upload({
                        Bucket: config.s3Bucket,
                        Key: key,
                        Body: new ReadableClone(body),
                        Metadata: {
                            date: new Date().toISOString()
                        }
                    }).promise(),
                pify(streamToBuffer)(new ReadableClone(body)) as Promise<Buffer> 
            ]);
            return cache[key] = buffer;
        }
    }
}

export default createBlobStore;
export type BlobStore = ReturnType<typeof createBlobStore>
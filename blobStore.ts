import S3 = require("aws-sdk/clients/s3");
import { Config } from "./config";
import { Readable } from "stream";
import pify from 'pify';
const streamToBuffer = require('fast-stream-to-buffer');
const ReadableClone = require('readable-stream-clone');

const createBlobStore = (config: Config, s3: S3) => {
    const cache: { [key: string]: Buffer } = {};

    return {
        async load(key: string): Promise<Buffer> {
            if(cache[key]) return cache[key];

            const readable = s3.getObject({
                Bucket: config.s3Bucket,
                Key: key,
            }).createReadStream();

            return cache[key] = await pify(streamToBuffer)(readable);
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
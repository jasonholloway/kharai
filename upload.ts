import S3 from 'aws-sdk/clients/s3'
import { Readable } from 'stream'

const s3 = new S3();

export type Config = {
    s3Bucket: string
}

export default (config: Config) => ({
    upload(key: string, body: Readable) {
        return s3.upload({
                    Bucket: config.s3Bucket,
                    Key: key,
                    Body: body
                }).promise();
    } 
})
import S3 from 'aws-sdk/clients/s3'
import { Readable } from 'stream'

export type Config = {
    s3Bucket: string
}

export default (config: Config, s3: S3) => ({
    upload(key: string, body: Readable) {
        return s3.upload({
                    Bucket: config.s3Bucket,
                    Key: key,
                    Body: body
                }).promise();
    } 
})
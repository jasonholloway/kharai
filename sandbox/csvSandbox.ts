import AWS from 'aws-sdk'
import createBlobStore from '../src//blobStore';
import config from '../src/config'
import { diffMembers } from '../src/behaviour/members'
import toReadableStream from 'to-readable-stream'

AWS.config.update({
    apiVersion: '2012-08-10',
    sslEnabled: false,
    httpOptions: {
        proxy: 'localhost:8080'
    }
})

const s3 = new AWS.S3();
const blobs = createBlobStore(config, s3);

const log = (...args: any[]) => console.log(...args)

const s0 = toReadableStream(new Buffer(0)); // blobs.load('dnn/members/000000');
const s1 = blobs.load('dnn/members/000000');

diffMembers(s0, s1)
    .then(updates => {        

        const r = Array.from(updates)

        for(let u of updates) log(u); 

        log('length', r.length);

    })
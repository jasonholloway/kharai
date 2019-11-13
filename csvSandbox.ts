import csv from 'csv-parse'
import config from './config'
import AWS from 'aws-sdk'
import createBlobStore from './blobStore';
import getStream from 'get-stream'

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

const parse = () => csv({ delimiter: '\t', columns: true, skip_empty_lines: true });

Promise.all([
    getStream.buffer(blobs.load('dnn/members/000000')),
    getStream.buffer(blobs.load('dnn/members/000233'))
])
.then(([members1, members2]) => {
    log(members1.length)
    log(members2.length)

    log(members2[2])

})



// blobs.load('dnn/members/000000')
//     .pipe(csv({ delimiter: '\t', columns:true, skip_empty_lines: true }))
//     .on('data', row => log(row))
//     .on('end', () => log('END!'))
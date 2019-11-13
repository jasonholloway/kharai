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
    getStream.array(blobs.load('dnn/members/000000').pipe(parse())),
    getStream.array(blobs.load('dnn/members/000233').pipe(parse()))
])
.then(([r1, r2]) => {
    const newMembers = [], lostMembers = [];

    const before = sortById(r1);
    const after = sortById(r2);

    let iA = 0, iB = 0;
    while(true) {
        const a = before[iA], b = after[iB];

        if(!a && !b) {
            break;
        }

        if((!a && b) || (b.id < a.id)) {
            newMembers.push(b);
            iB++;
            continue;
        }

        if((a && !b) || (a.id < b.id)) {
            lostMembers.push(a);
            iA++;
            continue;
        }

        iA++; iB++;
    }
    
    function sortById(r: any[]) {
        return r.map((i: any) => ({ ...i, id: parseInt(i['Member ID']) }))
            .sort((a, b) => a.id - b.id) 
    }
})



// blobs.load('dnn/members/000000')
//     .pipe(csv({ delimiter: '\t', columns:true, skip_empty_lines: true }))
//     .on('data', row => log(row))
//     .on('end', () => log('END!'))
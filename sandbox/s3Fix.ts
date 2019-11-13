import AWS from 'aws-sdk'

AWS.config.update({
    apiVersion: '2012-08-10',
    sslEnabled: false,
    httpOptions: {
        proxy: 'localhost:8080'
    }
})

const s3 = new AWS.S3();

s3.listObjectsV2({
        Bucket: 'dotnetnorth-data',
    }).promise()
    .then(objs => objs.Contents && Promise.all(
        objs.Contents
            .map(async (item, i) => {
                if(item.Key) {
                    const matched = /M:(.+)/.exec(item.Key)
                    if(matched != null) {
                        const date = matched[1];
                        await s3.copyObject({
                                Bucket: 'dotnetnorth-data',
                                CopySource: `/dotnetnorth-data/${item.Key}`,
                                Key: `dnn/members/${ i.toString().padStart(6, '0')}`,
                                Metadata: { 
                                    date 
                                },
                                MetadataDirective: 'REPLACE' 
                            }).promise();
                    }
                }
            })))
    .catch(console.error)

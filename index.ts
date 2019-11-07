import createRunner, { RunContext } from './runner'
import config from './config'
import createSpec from './spec'
import AWS from 'aws-sdk'
import createScheduler from './scheduler';

AWS.config.update({
    apiVersion: '2012-08-10',
    sslEnabled: false,
    httpOptions: {
        proxy: 'localhost:8080'
    }
})

const dynamo = new AWS.DynamoDB();
const s3 = new AWS.S3();

const spec = createSpec(config, s3);
const runner = createRunner(config, spec, dynamo);

const sink = (err: any) => {
    console.error(err)
    scheduler.close()
}

const scheduler = createScheduler(sink);

const run: RunContext = {
    timeout: Date.now() + (1000 * 10),
    scheduler,
    sink
}

scheduler.add({
    due: run.timeout,
    do() {
        console.debug('timeout!')
        scheduler.close();
    }
})

runner.execute(run)(['memberDownloader'])
    .then(() => console.log('DONE'))
    .catch(sink)

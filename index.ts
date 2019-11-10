import createRunner, { RunContext } from './runner'
import config from './config'
import createSpec from './spec'
import AWS from 'aws-sdk'
import createStore from './store';
import createTimer from './timer';

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
const store = createStore(config, dynamo)
const timer = createTimer();

const runner = createRunner(config, spec, store, timer);

const sink = (err: any) => {
    console.error(err)
    timer.complete();
    //store.complete();
}

const run: RunContext = {
    timeout: Date.now() + (1000 * 10),
    sink
}

setTimeout(() => {
    console.debug('timeout!')
    timer.complete();
    //store.complete();
}, run.timeout - Date.now());

runner.execute(run)(['memberDownloader2'])
    .then(() => console.log('DONE'))
    .then(timer.complete)
    .catch(sink)

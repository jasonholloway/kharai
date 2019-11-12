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

const end = () => {
    clearTimeout(h);
    timer.complete();
    store.endAllWatches();
}

const sink = (err: any) => {
    console.error(err)
    end();
}

const run: RunContext = {
    timeout: Date.now() + (1000 * 10),
    sink
}

const h = setTimeout(() => {
    console.debug('timeout!')
    end();
}, run.timeout - Date.now());

runner.execute(run)(['memberDownloader', 'watcher'])
    .then(() => console.log('DONE'))
    .then(end)
    .catch(sink)

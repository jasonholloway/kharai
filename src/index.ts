import createRunner, { RunContext } from './runner'
import config from './config'
import createSpec from './spec'
import AWS from 'aws-sdk'
import createTimer from './timer';
import createBlobStore from './blobStore';
import MachineStore from './MachineStore';
import Store from './Store';

AWS.config.update({
    apiVersion: '2012-08-10',
    sslEnabled: false,
    httpOptions: {
        proxy: 'localhost:8080'
    }
})

const dynamo = new AWS.DynamoDB();
const s3 = new AWS.S3();

const blobs = createBlobStore(config, s3);
const store = new Store(config, dynamo);
const machineStore = new MachineStore(store);

const spec = createSpec(config, blobs);
const timer = createTimer();

const runner = createRunner(spec, store, machineStore, timer);

const end = () => {
    clearTimeout(h);
    timer.complete();
    machineStore.complete();
    store.complete();
}

const sink = (err: any) => {
    console.error(err)
    end();
}

const started = Date.now();

const run: RunContext = {
    started,
    timeout: started + (1000 * 10),
    sink
}

const h = setTimeout(() => {
    console.debug('timeout!')
    end();
}, run.timeout - Date.now());

runner.execute(run)(['memberFetcher', 'memberProcessor'])
    .then(() => console.log(`DONE in ${(Date.now() - started) / 1000}s`))
    .then(end)
    .catch(sink)

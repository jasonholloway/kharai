import createRunner, { RunContext } from './runner'
import config from './config'
import createSpec from './spec'
import DynamoDB from 'aws-sdk/clients/dynamodb';
import { EventEmitter } from 'events';

const dynamo = new DynamoDB({ apiVersion: '2012-08-10' });
const spec = createSpec(config);
const runner = createRunner(config, spec, dynamo);


let isCancelled = false;

const run: RunContext = {
    timeout: Date.now() + (1000 * 10),
    events: new EventEmitter(),
    isCancelled: () => isCancelled,
    sink: (err) => { 
        isCancelled = true;
        run.events.emit('cancel')
        console.error(err);
    }
}

setTimeout(() => {
    console.debug('timeout!')
    run.events.emit('cancel');
}, run.timeout - Date.now())

runner.execute(run)(['memberDownloader'])
    .then(() => console.log('DONE'))

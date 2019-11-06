import createRunner, { RunContext } from './runner'
import config from './config'
import createSpec from './spec'
import DynamoDB from 'aws-sdk/clients/dynamodb';
import createScheduler from './scheduler';

const dynamo = new DynamoDB({ apiVersion: '2012-08-10' });
const spec = createSpec(config);
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

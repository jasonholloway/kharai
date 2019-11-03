import createRunner from './runner'
import config from './config'
import createSpec from './spec'
import DynamoDB from 'aws-sdk/clients/dynamodb';

const dynamo = new DynamoDB({ apiVersion: '2012-08-10' });
const spec = createSpec(config);
const runner = createRunner(config, spec, dynamo);

runner.run()
    .then(console.log)
    .catch(console.log)

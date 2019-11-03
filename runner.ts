import DynamoDB from 'aws-sdk/clients/dynamodb'
import { peek, delay, clone, promisify } from './util'
import spec from './spec';

const dynamo = new DynamoDB({ apiVersion: '2012-08-10' });

const tableName = 'dotnetnorth-state';
const itemKey = 'state';


type State = { 
    version: number, 
    phase?: string, 
    due: number, 
    data: any 
}


const log = peek;

const run = async () => {
    while(true) {
        const state = await summonState();

        if(isDue) {
            await dispatch(state)
                .then(log('next'))
                .then(saveState)
        }

        await delay(2000);
    }
}

const isDue = (state: State) => {
    const now = Date.now();
    const due = state.due || 0;
    return due <= now;
}

const dispatch = (origState: State): Promise<State> => {
    const state = clone(origState)

    const handler = spec.match(state.phase)
    if(!handler) throw Error(`no handler found for '${state.phase}'`);

    return promisify(handler(state))
        .then(next => {
            let phase, delay = 0;

            if(typeof next == 'string') {
                phase = next;
            }
            else {
                [phase, delay] = next;
            }

            state.phase = phase;
            state.due = Date.now() + delay;
            state.version++;

            return state;
        })
}

//what happens if the phase is wrong??? to the error state please

const summonState = () : Promise<State> =>
    dynamo.getItem({
        TableName: tableName,
        Key: {
            part: { S: itemKey }
        }
    }).promise()
    .then(({ Item: x }) => ({ 
        version: x && x.version 
            ? parseInt(x.version.N || '0') 
            : 0,
        phase: x && x.phase
            ? x.phase.S
            : 'start',
        data: x && x.data 
            ? JSON.parse(x.data.S || '{}') 
            : {},
        due: x && x.due 
            ? parseInt(x.due.N || '0') 
            : 0
    }));

const saveState = (state: State) : Promise<any> =>
    dynamo.putItem({
        TableName: tableName,
        Item: {
            part: { S: itemKey },
            version: { N: state.version.toString() },
            phase: { S: state.phase },
            data: { S: JSON.stringify(state.data) },
            due: { N: state.due.toString() }
        },
        ConditionExpression: 'version < :version',
        ExpressionAttributeValues: {
            ':version': { N: state.version.toString() }
        }
    })
    .promise();

run().then(console.log).catch(console.log)

import DynamoDB from 'aws-sdk/clients/dynamodb'
import { clone, promisify } from './util'
import { Config } from './config';
import { Spec } from './spec';


type State = { 
    version: number, 
    phase?: string, 
    due: number, 
    data: any 
}

export default (config: Config, spec: Spec, dynamo: DynamoDB) => {

    const run = async () => {
        let state = await loadState();
        const origVersion = state.version;

        while(isDue(state)) {
            state = await dispatch(state);
            console.log('next', state);
        }

        if(state.version > origVersion) {
            await saveState(state);
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
                let phase, delay = 0, save = false;

                if(typeof next == 'string') {
                    phase = next;
                }
                else if(typeof next == 'object') {
                    phase = next.next;
                    delay = next.delay || 0;
                    save = !!next.save;
                }
                else {
                    [phase, delay] = next;
                }

                state.phase = phase;
                state.due = Date.now() + delay;
                state.version++;

                if(save) {
                    return saveState(state)
                        .then(() => state);
                }

                return state;
            })
    }

    //what happens if the phase is wrong??? to the error state please

    const loadState = () : Promise<State> =>
        dynamo.getItem({
            TableName: config.tableName,
            Key: {
                part: { S: 'state' }
            }
        })
        .promise()
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
            TableName: config.tableName,
            Item: {
                part: { S: 'state' },
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

    return {
        run
    };
}
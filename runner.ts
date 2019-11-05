import DynamoDB from 'aws-sdk/clients/dynamodb'
import { clone, promisify } from './util'
import { Config } from './config';
import { Spec } from './spec';
import { clearTimeout, setTimeout } from 'timers';
import FlatQueue from 'flatqueue'


type State = { 
    id: string,
    type?: string,
    version: number, 
    phase?: string, 
    due: number, 
    data: any 
}


const createDispatcher = () => {
    let heap = new FlatQueue<State>();
    let waiter: NodeJS.Timeout

    const fire = () => {
        const now = Date.now();
        const due = -heap.peek();

        //don't think the below even has to be checked...
        if(due <= now) {
            //...

        }
        else {
            waiter = setTimeout(fire, now - due);
        }
    }

    return {
        addJob(job: State) {
            const now = Date.now();
            const due = -heap.peek();

            heap.push(-due, job);

            if(heap.peekValue() === job) {
                clearTimeout(waiter);
                waiter = setTimeout(fire, now - due);
            }
        }
    }
}


export default (config: Config, spec: Spec, dynamo: DynamoDB) => {

    let waiter: NodeJS.Timeout;

    const run = (ids: string[]) => {


        //continue firing jobs off
        //till empty
        //then we wait till a new job appears


        return Promise.all(
            ids.map(async id => {
                let state = await loadState(id);
                const origVersion = state.version;

                while(isDue(state)) {
                    state = await dispatch(state);
                    console.log('next', state);
                }

                return state.version > origVersion
                    ? [state]
                    : [];
            }))
            .then(states => states.reduce((prev, v) => [...prev, ...v]))
            .then(saveStates);      
    }
            
            //async (states) => {
                //but saving has to be total, as one transaction

            //     if(state.version > origVersion) {
            //         await saveState(state);
            //     }
            // })

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
                    //BUT!!! this needs redoing
                    //as it no longer makes much sense: basically, given this instruction
                    //we need to save everything as soon as possible
                    //but we can't just save this one alone...
                    // return saveStates([state])
                    //     .then(() => state);
                }

                return state;
            })
    }

    //what happens if the phase is wrong??? to the error state please

    const loadState = (id: string) : Promise<State> =>
        dynamo.getItem({
            TableName: config.tableName,
            Key: {
                part: { S: id }
            }
        })
        .promise()
        .then(({ Item: x }) => ({ 
            id,
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

    const saveStates = (states: State[]) : Promise<any> =>
        dynamo.transactWriteItems({
            TransactItems: states.map(state => ({
                Put: {
                    TableName: config.tableName,
                    Item: {
                        part: { S: state.id },
                        version: { N: state.version.toString() },
                        phase: { S: state.phase },
                        data: { S: JSON.stringify(state.data) },
                        due: { N: state.due.toString() }
                    },
                    ConditionExpression: 'version < :version',
                    ExpressionAttributeValues: {
                        ':version': { N: state.version.toString() }
                    }
                }
            }))
        }).promise();


        // dynamo.putItem({
        //     TableName: config.tableName,
        //     Item: {
        //         part: { S: 'state' },
        //         version: { N: state.version.toString() },
        //         phase: { S: state.phase },
        //         data: { S: JSON.stringify(state.data) },
        //         due: { N: state.due.toString() }
        //     },
        //     ConditionExpression: 'version < :version',
        //     ExpressionAttributeValues: {
        //         ':version': { N: state.version.toString() }
        //     }
        // })
        // .promise();

    return {
        run
    };
}
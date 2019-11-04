import DynamoDB from 'aws-sdk/clients/dynamodb'
import { clone, promisify } from './util'
import { Config } from './config';
import { Spec } from './spec';


type State = { 
    id: string,
    type?: string,
    version: number, 
    phase?: string, 
    due: number, 
    data: any 
}

//the below is still incomplete/rubbish
//isDue should be attempted at each interstice for every waiting machine
//need an ordered set of due jobs <<<<<<< this 
//we should continually run things from the ordered set
//till there's nothing within range
//machines should only requeue themselves when their phase hase finished

//also, need to respect explicit save points = checkpoints
//given a checkpoint instruction, we should save states AS SOON AS POSSIBLE because the thing to be saved is valuable
//so, such an instruction should inject a saving process that has to finish before we continue (though individual phases can get on with it in the bg)
//this again suggests the orchestrator being a machine itself

export default (config: Config, spec: Spec, dynamo: DynamoDB) => {

    const run = (ids: string[]) =>
        Promise.all(
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
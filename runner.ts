import DynamoDB from 'aws-sdk/clients/dynamodb'
import { clone, promisify } from './util'
import { Config } from './config';
import { Spec } from './spec';
import createScheduler from'./scheduler'

type State = { 
    id: string,
    type?: string,
    version: number, 
    phase?: string, 
    due: number, 
    data: any 
}

type Context = {
    saveAll(): void
}

type Machine = {
    state: State
}

export default (config: Config, spec: Spec, dynamo: DynamoDB) => {

    const scheduler = createScheduler();

    const schedule = (x: Context) => (m: Machine) =>
        scheduler.add({
            due: m.state.due,
            run: async () => {
                const result = await perform(m.state);
                m.state = result.state;

                if(result.forceSave) {
                    x.saveAll();
                }

                //is state terminal?
                //is saving otherwise due? - after period, when finishing run

                schedule(x)(m);
            }
        });

    const run = async (ids: string[]) => {
        const states = await Promise.all(ids.map(loadMachine)); //loading could be done in multiple here

        const x = {
            saveAll() {}
        };

        states.map(state => ({ state }))
            .forEach(schedule(x));
    }


    //     return await Promise.all(
    //         ids.map(async id => {
    //             let state = await loadMachine(id);
    //             const origVersion = state.version;

    //             while(isDue(state)) {
    //                 state = await dispatch(state);
    //                 console.log('next', state);
    //             }

    //             return state.version > origVersion
    //                 ? [state]
    //                 : [];
    //         }))
    //         .then(states => states.reduce((prev, v) => [...prev, ...v]))
    //         .then(saveStates);      
    // }
            
            //async (states) => {
                //but saving has to be total, as one transaction

            //     if(state.version > origVersion) {
            //         await saveState(state);
            //     }
            // })

    type Result = {
        state: State,
        forceSave: boolean
    }


    const perform = (origState: State): Promise<Result> => {
        const state = clone(origState)

        const handler = spec.match(state.phase)
        if(!handler) throw Error(`no handler found for '${state.phase}'`);

        return promisify(handler(state))
            .then(next => {
                let phase, delay = 0, forceSave = false;

                if(typeof next == 'string') {
                    phase = next;
                }
                else if(typeof next == 'object') {
                    phase = next.next;
                    delay = next.delay || 0;
                    forceSave = !!next.save;
                }
                else {
                    [phase, delay] = next;
                    delay = delay || 0;
                }

                state.phase = phase;
                state.due = Date.now() + delay;
                state.version++;

                return {
                   state,
                   forceSave
                };
            })
    }

    //what happens if the phase is wrong??? to the error state please

    const loadMachine = (id: string) : Promise<State> =>
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
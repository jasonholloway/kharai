import DynamoDB from 'aws-sdk/clients/dynamodb'
import { clone, promisify } from './util'
import { Config } from './config';
import { Spec } from './spec';
import createScheduler from'./scheduler'

export default (config: Config, spec: Spec, dynamo: DynamoDB) => {

    const scheduler = createScheduler();

    type State = { 
        readonly id: string,
        readonly type?: string,
        version: number, 
        phase?: string, 
        due: number, 
        data: any 
    }

    type MachineContext = {
        state: State
        saveAll(): void
    }

    type Result = {
        state: State,
        forceSave: boolean
    }

    const schedule = (m: MachineContext) =>
        scheduler.add({
            due: m.state.due,
            run: async () => {
                const { state, forceSave } = await dispatch(m.state);
                m.state = state;

                if(forceSave) {
                    m.saveAll();
                }

                //is state terminal?
                //is saving otherwise due? - after period, when finishing run

                schedule(m);
            }
        });

    const run = (ids: string[]) =>
        loadMachines(ids)
            .then(runMachines);

    const loadMachines = (ids: string[]): Promise<State[]> =>
        Promise.all(ids.map(loadMachine));  //should load all at once - think we need transactionality here...

    const runMachines = (states: State[]) => {
        let saving = Promise.resolve();

        const machines = states
            .map(state => ({
                state,
                saveAll: () => {
                    const captured = clone(machines.map(m => m.state))
                    saving = saving
                        .then(() => saveStates(captured))
                        .catch(e => {})
                }

                //
                // saving should be done by a special looping agent
                // with its own sink that can be sunk at the top of the program
                //

                //
                // we need to stop executing: a timer needs to tell us to cancel promptish
                //
                //
            }));

        machines.forEach(schedule);
    }

    const dispatch = (origState: State): Promise<Result> => {
        const state = clone(origState)

        const action = spec.match(state.phase) //should be called 'bindAction'
        if(!action) throw Error(`no handler found for '${state.phase}'`);

        return promisify(action(state))
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

    return {
        run
    };
}
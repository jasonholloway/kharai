import DynamoDB from 'aws-sdk/clients/dynamodb'
import { clone, promisify } from './util'
import { Config } from './config';
import { Binder } from './spec';
import { Scheduler } from'./scheduler'
import createThreader from './threader';

export type RunContext = {
    readonly timeout: number
    readonly scheduler: Scheduler
    sink(error: Error): void
}

type State = { 
    readonly id: string,
    readonly type?: string,
    readonly dbVersion: number,
    version: number, 
    phase?: string, 
    due: number, 
    data: any 
}

type Result = {
    state: State,
    forceSave: boolean
}

export default (config: Config, spec: Binder, dynamo: DynamoDB) => {

    const log = (...args: any[]) => console.debug('runner:', ...args)

    const execute = (run: RunContext) => (ids: string[]) =>
        loadMachines(ids)
            .then(runMachines(run))

    const loadMachines = (ids: string[]): Promise<State[]> =>
        Promise.all(ids.map(loadMachine));  //should load all at once - think we need transactionality here...

    const runMachines = (run: RunContext) => (states: State[]) => {
        const threader = createThreader(run.scheduler);

        let saving = Promise.resolve();

        log('running', states)

        const all = states.map(state => ({ state }))

        all.forEach(m => 
            threader.add({
                due: m.state.due,
                async do() {
                    log('thread do')
                    const r = await dispatch(m.state)
                                    .catch(saveRethrow);

                    m.state = r.state;

                    if(r.forceSave) {
                        saveAll();
                    }

                    return r.state.due < run.timeout
                        ? r.state.due
                        : false;
                }
            }));

        const saveAll = (): void => {
            const captured = clone(all.map(m => m.state))
            saving = saving
                .then(() => saveStates(captured))
                .catch(run.sink)
        }

        const saveRethrow = (err: any) => {
            saveAll();
            throw err;
        }

        return threader.complete()
            .then(saveAll)
            .then(() => saving)
    }

    //
    // saving should be done by a special looping agent
    // with its own sink that can be sunk at the top of the program
    //

    const dispatch = (origState: State): Promise<Result> => {
        log('dispatching')
        const state = clone(origState)

        const action = spec.bindAction(state.phase);
        if(!action) throw Error(`no action found for '${state.phase}'`);

        return promisify(action(state))
            .then(next => {
                let phase, delay = 0, forceSave = false;

                if(typeof next == 'string') {
                    phase = next;
                }
                else if(typeof next == 'object') {
                    phase = next.next;
                    delay = next.delay ? Math.max(0, next.delay) : 0;
                    forceSave = !!next.save;
                }
                else {
                    [phase, delay] = next;
                    delay = delay ? Math.max(0, delay) : 0;
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
        .then(({ Item: x }) => {
            const version = x && x.version 
                    ? parseInt(x.version.N || '0') 
                    : 0;

            return { 
                id,
                version,
                dbVersion: version,
                phase: x && x.phase
                    ? x.phase.S
                    : 'start',
                data: x && x.data 
                    ? JSON.parse(x.data.S || '{}') 
                    : {},
                due: x && x.due 
                    ? parseInt(x.due.N || '0') 
                    : 0
            }
        });

    const saveStates = (states: State[]) : Promise<any> => {
        const pendings = states
            .filter(s => s.version > s.dbVersion)
            .map(clone)

        if(pendings.length) {
            return dynamo.transactWriteItems({
                TransactItems: pendings.map(state => ({
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
            }).promise()
        }
        else {
            return Promise.resolve();
        }
    }

        //
        // FURTHER PROBLEM
        // saving happens in background; dbVersion can't therefore be part of state
        // dbVersion is to be known only to the saving agent
        //

    return {
        execute
    };
}
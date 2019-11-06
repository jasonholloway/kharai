import DynamoDB from 'aws-sdk/clients/dynamodb'
import { clone, promisify } from './util'
import { Config } from './config';
import { Spec } from './spec';
import createScheduler, { Scheduler } from'./scheduler'
import { EventEmitter } from 'events';

export type RunContext = {
    readonly timeout: number
    isCancelled(): boolean
    events: EventEmitter
    sink(error: Error): void
}

type Entity = {
    version: number
    dbVersion: number
}

type MachineContext = {
    readonly run: RunContext
    readonly state: State,
    set(state: State): void
    saveAll(): void
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

export default (config: Config, spec: Spec, dynamo: DynamoDB) => {

    const execute = (run: RunContext) => (ids: string[]) =>
        loadMachines(ids)
            .then(runMachines(run))
            .catch(run.sink)

    const loadMachines = (ids: string[]): Promise<State[]> =>
        Promise.all(ids.map(loadMachine));  //should load all at once - think we need transactionality here...

    const runMachines = (run: RunContext) => (states: State[]) => {
        const scheduler = createScheduler(run);
        let saving = Promise.resolve();

        console.debug('running', states)

        const saveAll = (): void => {
            const captured = clone(machines.map(m => m.state))
            saving = saving
                .then(() => saveStates(captured))
                .catch(run.sink)
        }

        const machines = states
            .map(state => ({
                run,
                state,
                set(state: State) {
                    this.state = state;
                },
                saveAll
            }));

        machines.forEach(schedule(scheduler));

        return scheduler.complete
            .then(saveAll)
            .then(() => saving)
    }

    const schedule = (scheduler: Scheduler) => (m: MachineContext) => {
        console.debug(`scheduling ${m.state.id}:${m.state.phase}; due ${m.state.due}`)
        scheduler.add({
            due: m.state.due,
            run: async () => {
                const { state, forceSave } = await dispatch(m.state);
                m.set(state)

                if(forceSave) {
                    m.saveAll();
                }

                schedule(scheduler)(m);
            }
        });
    }

    //the timeout could just cancel everything indiscriminately
    //or we could let things decide whether to cancel themselves

    //
    // saving should be done by a special looping agent
    // with its own sink that can be sunk at the top of the program
    //

    //
    // we need to stop executing: a timer needs to tell us to cancel promptish
    //
    //

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

    //
    // below should only try to save what's changed
    // otherwise the condition will always fail
    //

    //
    // try to save after behavioural error
    //

    const saveStates = (states: State[]) : Promise<any> => {
        const pendings = states.filter(s => s.version > s.dbVersion)
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
        // SO...
        // we want our singlethreaded saving agent with its small switchable queue
        // and we want it to have access to its own magic state
        // in fact; why can't it be a loading/saving agent?
        //
        // MACHINECONTEXT ENTITYCONTEXT - the latter is what concerns us
        //


    return {
        execute
    };
}
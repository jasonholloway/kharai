import DynamoDB from 'aws-sdk/clients/dynamodb'
import { clone, promisify } from './util'
import { Config } from './config';
import { Spec } from './spec';
import createScheduler, { Scheduler } from'./scheduler'
import { EventEmitter } from 'events';
import createThreader, { Threader } from './threader';

export type RunContext = {
    readonly timeout: number
    isCancelled(): boolean
    events: EventEmitter
    sink(error: Error): void
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
        const threader = createThreader(scheduler);

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

        machines.forEach(m => threader.add({
            due: m.state.due,
            async run() {
                const { state, forceSave } = await dispatch(m.state);
                m.set(state);

                if(forceSave) {
                    m.saveAll();
                }

                return state.due;
            }
        }));

        return threader.complete()
            .then(saveAll)
            .then(() => saving)
    }

    // below should be made slightly more abstract by scheduler: we shouldn't have to recurse so blatantly here
    // we just want to return a delay or a completion message

    //so scheduler should self-schedule
    //and take on rerunnable jobs

    //then this will allow us to terminate nicely from below
    //

    //
    // saving should be done by a special looping agent
    // with its own sink that can be sunk at the top of the program
    //

    //
    // we need to stop rescheduling if the job will be past the threshold
    // but we also need a way for the scheduler to complete if there are no active jobs in play
    // so an active job tries to schedule itself for the future, but the scheduler quietly drops it
    // similarly, the scheduler will know what's alive and what's not
    // it needs a register of active jobs - how about passing from one state to the next
    // either way job registration is to be reformed
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
    // try to save after behavioural error
    //

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
import DynamoDB from 'aws-sdk/clients/dynamodb'
import { clone, isTuple2 } from './util'
import { Config } from './config';
import { Spec } from './spec';
import { Scheduler } from'./scheduler'
import createThreader from './threader';
import createSaver from './saver';

export type RunContext = {
    readonly timeout: number
    readonly scheduler: Scheduler
    sink(error: Error): void
}

export type Machine = {
    readonly id: string,
    readonly type?: string,
    readonly db: { version: number },
    state: State
}

type State = { 
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

    const log = (...args: any[]) => console.debug('runner:', ...args)

    const execute = (run: RunContext) => (ids: string[]) =>
        loadMachines(ids)
            .then(runMachines(run))

    const loadMachines = (ids: string[]): Promise<Machine[]> =>
        Promise.all(ids.map(loadMachine));  //should load all at once - think we need transactionality here...

    const runMachines = (run: RunContext) => (machines: Machine[]) => {
        const threader = createThreader(run.scheduler);
        const saver = createSaver(config, dynamo, run);

        log('running', machines)

        machines.forEach(m => 
            threader.add({
                name: m.id,
                due: m.state.due,
                async do() {
                    log('thread do')
                    const r = await dispatch(m).catch(saveRethrow);

                    m.state = r.state;

                    if(r.forceSave) {
                        saver.save(machines);
                    }

                    return r.state.due < run.timeout
                        ? r.state.due
                        : false;
                }
            }));

        const saveRethrow = (err: any) => {
            saver.save(machines);
            throw err;
        }

        return threader.complete()
            .finally(() => saver.save(machines))
            .then(saver.complete)
    }

    const dispatch = (m: Machine): Promise<Result> => {
        log('dispatching')
        const state = clone(m.state)

        const action = spec.bindAction(state.phase);
        if(!action) throw Error(`no action found for '${state.phase}'`);

        const context = { id: m.id, version: m.state.version, data: m.state.data };

        return action(context) //data will get overwritter like this and lost...
            .then(next => {
                let phase, delay = 0, forceSave = false;

                if(typeof next == 'string') {
                    phase = next;
                }
                else if(isTuple2(next)) {
                    [phase, delay] = next;
                    delay = delay ? Math.max(0, delay) : 0;
                }
                else {
                    phase = next.next;
                    delay = next.delay ? Math.max(0, next.delay) : 0;
                    forceSave = !!next.save;
                }

                state.phase = phase;
                state.due = Date.now() + delay;
                state.data = context.data;
                state.version++;

                return {
                   state,
                   forceSave
                };
            })
    }

    //what happens if the phase is wrong??? to the error state please

    const loadMachine = (id: string) : Promise<Machine> =>
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
                db: { version },
                state: {
                    version,
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
            }
        });

    return {
        execute
    };
}
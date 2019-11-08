import DynamoDB from 'aws-sdk/clients/dynamodb'
import { clone, isTuple2 } from './util'
import { Config } from './config';
import { Spec, Next, Result } from './spec';
import { Scheduler } from'./scheduler'
import createThreader from './threader';
import createSaver from './saver';
import { isArray } from 'util';

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

                    m.state.data = r.data;
                    m.state.due = r.due;
                    m.state.version++;

                    if(r.save) {
                        saver.save(machines);
                    }

                    return r.due < run.timeout
                        ? r.due
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

    const dispatch = (m: Machine): Promise<Result<string>> => {
        log('dispatching')

        const action = spec.bindAction(m.state.phase);
        if(!action) throw Error(`no action found for '${m.state.phase}'`);

        const context = { 
            id: m.id, 
            version: m.state.version, 
            data: clone(m.state.data) 
        };

        return action(context)
            .then(fn => fn(context)); //data will get overwritter like this and lost...
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
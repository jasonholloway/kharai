import { AttributeMap } from 'aws-sdk/clients/dynamodb'
import { clone } from './util'
import { Config } from './config';
import { Spec, Result } from './spec';
import { Scheduler } from'./scheduler'
import createThreader from './threader';
import createSaver from './saver';
import { DbMap, Storable, Store } from './store';

export type Machine = Storable & {
    phase?: string, 
    due: number, 
    data: any 
}

export const machineDb: DbMap<Machine> = {
    load: (base: Storable, item: AttributeMap): Machine =>
        ({
            ...base,
            phase: item.phase
                ? item.phase.S
                : 'start',
            data: item && item.data 
                ? JSON.parse(item.data.S || '{}') 
                : {},
            due: item && item.due 
                ? parseInt(item.due.N || '0') 
                : 0
        }),

    save: (item: AttributeMap, m: Machine): AttributeMap =>
        ({
            ...item,
            phase: { S: m.phase },
            data: { S: JSON.stringify(m.data) },
            due: { N: m.due.toString() }
        })
}

export type RunContext = {
    readonly timeout: number
    readonly scheduler: Scheduler
    sink(error: Error): void
}

export default (config: Config, spec: Spec, store: Store) => {

    const log = (...args: any[]) => console.debug('runner:', ...args)

    const machineStore = store.createClient(machineDb)

    const execute = (run: RunContext) => (ids: string[]) =>
        loadMachines(ids)
            .then(runMachines(run))

    const loadMachines = (ids: string[]): Promise<Machine[]> =>
        Promise.all(ids.map(machineStore.load));  //should load all at once - think we need transactionality here...

    const runMachines = (run: RunContext) => (machines: Machine[]) => {
        const threader = createThreader(run.scheduler);
        const saver = createSaver(store);

        log('running', machines)

        machines.forEach(m => 
            threader.add({
                name: m.id,
                due: m.due,
                async do() {
                    log('thread do')
                    const r = await dispatch(m)
                        .catch(saveRethrow);

                    m.data = r.data;
                    m.due = r.due;
                    m.version++;

                    if(r.save) {
                        saver.save(machines);
                    }

                    //below: specify hook as well as due
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

        const action = spec.bindAction(m.phase);
        if(!action) throw Error(`no action found for '${m.phase}'`);

        const context = { 
            id: m.id, 
            version: m.version, 
            data: clone(m.data) 
        };

        return action(context)
            .then(fn => fn(context)); //data will get overwritter like this and lost...
    }

    //what happens if the phase is wrong??? to the error state please

    return {
        execute
    };
}
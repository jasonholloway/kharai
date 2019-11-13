import { AttributeMap } from 'aws-sdk/clients/dynamodb'
import { clone } from './util'
import { Config } from './config';
import { Spec, Result } from './spec';
import createThreader from './threader';
import createSaver from './saver';
import { DbMap, Storable, Store } from './store';
import { Timer } from './timer';

export type MachineState = {
    phase?: string, 
    due: number, 
    watch?: readonly [string[], string],
    data: any 
}

export type Machine = Storable<MachineState>

export const machineDb: DbMap<MachineState> = {
    load: (item: AttributeMap): MachineState =>
        ({
            phase: item.phase
                ? item.phase.S
                : 'start',
            data: item && item.data 
                ? JSON.parse(item.data.S || '{}') 
                : {},
            due: item && item.due 
                ? parseInt(item.due.N || '0') 
                : 0,
            ...(item.watch && item.watch.S
                ? { watch: JSON.parse(item.watch.S) }
                : {})
        }),

    save: (m: MachineState): AttributeMap =>
        ({
            phase: { S: m.phase },
            data: { S: JSON.stringify(m.data) },
            due: { N: m.due.toString() },
            ...(m.watch 
                ? { watch: { S: JSON.stringify(m.watch) } } 
                : {})
        })
}

export type RunContext = {
    readonly started: number,
    readonly timeout: number
    sink(error: Error): void
}

export default (config: Config, spec: Spec, store: Store, timer: Timer) => {

    const log = (...args: any[]) => console.debug('runner:', ...args)

    const repo = store.createRepo(machineDb)

    const execute = (run: RunContext) => (ids: string[]) =>
        loadMachines(ids)
            .then(runMachines(run))

    const loadMachines = (ids: string[]): Promise<Machine[]> =>
        Promise.all(ids.map(repo.load));  //should load all at once - think we need transactionality here...

    const runMachines = (run: RunContext) => (machines: Machine[]) => {
        const threader = createThreader();
        const saver = createSaver(store);

        log('running', machines.map(m => m.id));

        const resume = async (m: Machine): Promise<boolean> => {
            if(m.state.watch) {
                const [targetIds, condition] = m.state.watch;
                const targetId = targetIds[0];
                const fn = <(m: Machine) => boolean>new Function('m', `return ${condition}`);

                log(m.id, 'resume watch', m.state.watch)
                return repo.watch(
                    targetId,
                    function(target) {
                        const met = fn(target)
                        log(`hook triggered ${target.id}>${m.id}`, met)
                        if(met) this.complete(true);
                    }
                )
            }

            const due = Math.max(0, m.state.due || 0);

            if(due < run.timeout) {
                log(m.id, 'resume delay', due, run.timeout);
                return timer.when(due);
            }
            else {
                log(m.id, 'not resumable')
                m.freeze();
                return false;
            }
        }


        //*****
        //shouldn't start before resume...

        machines.forEach(m => 
            threader.add({
                name: m.id,
                resume: resume(m),
                async do() {
                    const r = await dispatch(m)
                        .catch(saveRethrow);

                    m.setState(r.state);

                    if(r.save) {
                        saver.save(machines);
                    }

                    return resume(m);
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
        log('dispatching', m.id)

        const action = spec.bindAction(m.state.phase);
        if(!action) throw Error(`no action found for '${m.state.phase}'`);

        const context = { 
            id: m.id, 
            version: m.version, 
            data: clone(m.state.data) 
        };

        return action(context)
            .then(fn => fn(context)); //data will get overwritter like this and lost...
    }

    //what happens if the phase is wrong??? to the error state please

    return {
        execute
    };
}
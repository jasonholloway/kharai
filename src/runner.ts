import { clone } from './util'
import { Spec, Result } from './spec';
import createThreader, { Resumption } from './threader';
import { Timer } from './timer';
import MachineStore, { Machine, MachineState, InnerMachine } from './MachineStore';
import RowStore, { Storable } from './RowStore';
import Atom from './Atom';

export type RunContext = {
    readonly started: number,
    readonly timeout: number
    sink(error: Error): void
}

export default (spec: Spec, store: RowStore, repo: MachineStore, timer: Timer) => {

    const log = (...args: any[]) => console.debug('runner:', ...args)

    const execute = (run: RunContext) => (ids: string[]) =>
        loadMachines(ids)
            .then(runMachines(run))

    const loadMachines = (ids: string[]): Promise<Machine[]> =>
        Promise.all(ids.map(id => repo.load(id)));  //should load all at once - think we need transactionality here...

    const runMachines = (run: RunContext) => (machines: Machine[]) => {
        const threader = createThreader();

        log('running', machines.map(m => m.id));

        const getResumption = (m: Machine): Promise<Resumption|false>|false => {
            const s = m.getState();

            if(s.watch) {
                const [targetIds, condition] = s.watch;
                const targetId = targetIds[0];
                const fn = <(m: Storable<MachineState>) => boolean>new Function('m', `return ${condition}`);

                log(m.id, 'resume watch', s.watch)
                return repo.watch(
                    targetId,
                    function(target) {
                        const met = fn(target)
                        log(`hook triggered ${target.id}>${m.id}`, met)
                        if(met) this.complete({ upstream: new Atom([], []) });
                    }
                )
            }

            const due = Math.max(0, s.due || 0);

            if(due < run.timeout) {
                log(m.id, 'resume delay', due, run.timeout);
                return timer.when(due);
            }
            else {
                log(m.id, 'not resumable this run')
                return false;
            }
        }

        machines.forEach(m => {
            const resume = getResumption(m);
            if(resume) {
                threader.add({
                    name: m.id,
                    resume,
                    async do() {
                        const result = await m.update(async i => { //this right here creates the new atom
                            const r = await dispatch(i);
                            return [r.state, r];
                        })
                        .catch(saveRethrow) //final saving should be done _above_ here

                        if(result) {
                            const [atom, { save }] = result;
                            
                            if(save) store.saveAll(); //should sink errors

                            const resume = getResumption(m) //sheeeeeet... this is never returning cos its a nested promise bah
                            if(resume) {
                                return await resume;
                            }
                            else {
                                m.complete();
                                return false;
                            }
                        }
                        else {
                            //update unsuccessful: presumably gazumped
                            return false;
                        }
                    }
                })
            }
            else {
                m.complete();
            }
        })

        const saveRethrow = (err: any) => {
            store.saveAll()
            throw err;
        }

        return threader.complete()
            .then(() => repo.complete())
            .finally(() => store.saveAll())
            .then(() => store.complete())
    }

    const dispatch = (m: InnerMachine): Promise<Result> => { //this should return something to execute, instead of eagerly starting things at the beginning
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

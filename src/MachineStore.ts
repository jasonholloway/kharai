import RowStore, { Storable, DbMap } from "./RowStore";
import { AttributeMap } from "aws-sdk/clients/dynamodb";

//**************************************************************************************** */
//so, watches aren't being checked if the target is already frozen...
//
//
//




const log = (...args: any) => console.log('MachineStore', ...args);

type HookFn = (this: Hook, x: Storable<MachineState>) => void;

class Hook {
    private m: _Machine;
    private fn: HookFn;
    private resolve: (success: boolean) => void;
    private reject: (err: any) => void;
    private active = true;

    constructor(m: _Machine, fn: HookFn, resolve: (success: boolean) => void, reject: (err: any) => void) {
        this.m = m;
        this.fn = fn;
        this.resolve = resolve;
        this.reject = reject;
    }

    fire(s: Storable<MachineState>): void {
        try {
            this.fn.bind(this)(s);
        }
        catch(er) {
            this.reject(er)
        }

        if(this.m.isFrozen) {
            this.complete(false)
        }
    }

    async complete(success: boolean): Promise<void> {
        log('completing hook', this.m.id)
        if(this.active) {
            this.active = false;
            log('hook complete', this.m.id)
            this.m.hooks.splice(this.m.hooks.indexOf(this), 1)
            this.resolve(success);
            await Promise.resolve(); //what exactly is a completing hook waiting for? 
        }
    }
}


export type MachineState = {
    phase?: string, 
    due: number, 
    watch?: readonly [string[], string],
    data: any 
}

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

    mapToDb: (m: MachineState): AttributeMap =>
        ({
            phase: { S: m.phase },
            data: { S: JSON.stringify(m.data) },
            due: { N: m.due.toString() },
            ...(m.watch 
                ? { watch: { S: JSON.stringify(m.watch) } } 
                : {})
        })
}

export interface Machine {
    readonly id: string
    update<R>(fn: (m: InnerMachine) => Promise<[MachineState, R]|false>): Promise<R|false>
    getState(): MachineState
    complete(): Promise<void>
}

export interface InnerMachine {
    readonly id: string
    readonly version: number
    readonly state: Readonly<MachineState>
}

class _Machine implements Machine {
    storable: Storable<MachineState>
    readonly id: string;
    hooks: Hook[]
    isFrozen: boolean = false;

    constructor(storable: Storable<MachineState>) {
        this.storable = storable;
        this.id = storable.id;
        this.hooks = [];
    }

    async update<R>(fn: (m: InnerMachine) => Promise<[MachineState, R]|false>): Promise<R|false> {
        //should check version hasn't changed in meantime: local optimistic locking
        //!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        const s = this.storable;

        const result = await fn({
            id: s.id,
            version: s.version,
            state: s.state
        });

        if(result) {
            const [nextState, innerResult] = result;
            s.setState(nextState);
            this.hooks.forEach(h => h.fire(s))
            return innerResult;
        }
        else {
            return false;
        }
    }

    getState() {
        return this.storable.state;
    }

    async complete() {
        log('Machine', this.id, 'complete')
        this.isFrozen = true;
        await Promise.all(this.hooks.map(h => h.complete(false)))
    }
}



export default class MachineStore {
    private store: RowStore
    private loaded: { [id: string]: _Machine } = {};
    private go = true;

    constructor(store: RowStore) {
        this.store = store;
    }

    async load(id: string): Promise<Machine> {
        log('loading', id)
        if(this.go) {
            return this.loaded[id] = new _Machine(
                await this.store.load<MachineState>(id, machineDb));
        }
        else {
            throw Error('MachineStore closed')
        }
    }

    watch(id: string, fn: HookFn) {
        return new Promise<boolean>((resolve, reject) => {
            const m = this.loaded[id];
            if(this.go && m) {
                log('watching', id)
                const hook = new Hook(m, fn, resolve, reject);
                m.hooks.push(hook);
                hook.fire(m.storable);
                if(m.isFrozen) resolve(false);
            }
            else {
                resolve(false);
            }
        })
    }

    async complete() {
        this.go = false;
        await Promise.all(
            Object.values(this.loaded)
                .map(m => m.complete()));
    }
}

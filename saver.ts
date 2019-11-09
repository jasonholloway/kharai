import { Machine, machineDb } from "./runner";
import { EventEmitter } from "events";
import { Store } from "./store";

const createSaver = (store: Store) => {
    let go = true;
    let active = 0;
    let saving = Promise.resolve();
    const events = new EventEmitter();

    const complete = new Promise<void>((resolve, reject) => {
        events
            .on('saved', () => !go && active == 0 && resolve())
            .on('error', reject)
    })

    const client = store.createClient(machineDb);

    return {
        save(machines: Machine[]): void {
            if(!go) return;

            const captured = [...machines];

            active++;
            saving = saving
                .then(() => client.save(captured))
                .catch(err => {
                    go = false;
                    events.emit('error', err)
                })
                .finally(() => {
                    active--;
                    events.emit('saved');
                })
        },
        complete(): Promise<void> {
            go = false;
            return complete;
        }
    }
}

export default createSaver;
export type Saver = ReturnType<typeof createSaver>
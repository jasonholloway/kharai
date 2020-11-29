import { setTimeout, clearTimeout } from "timers";
import { Resumption } from "./threader";
import Atom from "./Atom";

type Entry = {
    promise: Promise<Resumption|false>,
    timeout: NodeJS.Timeout,
    resolve: (r: Resumption|false) => void
}

const createTimer = () => {
    let go = true;
    const entries: Entry[] = [];

    return {
        when(due: number): Promise<Resumption|false> {
            const promise = new Promise<Resumption|false>((resolve) => {
                if(!go) resolve(false);
                else {
                    entries.push({
                        promise,
                        timeout: setTimeout(
                            () => go && resolve({ upstream: new Atom([], []) }), 
                            Math.max(0, due || 0) - Date.now()),
                        resolve,
                    });
                }
            });

            return promise;
        },

        async complete(): Promise<void> {
            go = false;

            entries.forEach(e => {
                clearTimeout(e.timeout);
                e.resolve(false);
            });

            await Promise.all(entries.map(e => e.promise));
        }
    }
}

export default createTimer;
export type Timer = ReturnType<typeof createTimer>

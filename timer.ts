import { setTimeout, clearTimeout } from "timers";

type Entry = {
    promise: Promise<boolean>,
    timeout: NodeJS.Timeout,
    resolve: (r: boolean) => void
}

const createTimer = () => {
    let go = true;
    const entries: Entry[] = [];

    return {
        when(due: number): Promise<boolean> {
            const promise = new Promise<boolean>((resolve) => {
                if(!go) resolve(false);
                else {
                    entries.push({
                        promise,
                        timeout: setTimeout(
                            () => go && resolve(true), 
                            Math.max(0, due || 0) - Date.now()),
                        resolve
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

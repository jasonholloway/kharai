import csv from 'csv-parse'
import getStream from 'get-stream'
import { Readable } from 'stream';

class Added {
    readonly type = 'added' as const
    readonly id: number
    readonly name: string

    constructor(m: any) {
        this.id = m.id;
        this.name = m['Name']
    }
}

class Removed {
    readonly type = 'removed' as const
    readonly id: number

    constructor(m: any) {
        this.id = m.id;
    }
}

type Update = Added | Removed


const parse = () => csv({ delimiter: '\t', columns: true, skip_empty_lines: true });

export function diffMembers(s1: Readable, s2: Readable): Promise<Update[]> {
    return Promise.all([
        getStream.array(s1.pipe(parse())),
        getStream.array(s2.pipe(parse()))
    ])
    .then(([r1, r2]) => {
        const updates: Update[] = [];

        const before = sortById(r1);
        const after = sortById(r2);

        let iA = 0, iB = 0;
        while(true) {
            const a = before[iA], b = after[iB];

            if(!a && !b) {
                break;
            }

            if((!a && b) || (b.id < a.id)) {
                updates.push(new Added(b));
                iB++;
                continue;
            }

            if((a && !b) || (a.id < b.id)) {
                updates.push(new Removed(a))
                iA++;
                continue;
            }

            iA++; iB++;
        }

        return updates;
        
        function sortById(r: any[]) {
            return r.map((i: any) => ({ ...i, id: parseInt(i['Member ID']) }))
                .sort((a, b) => a.id - b.id) 
        }
    })

}
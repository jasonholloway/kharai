import flatMap from 'lodash/flatMap'

type AtomState = 'pending' | 'saving' | 'done'

const maxRowsPerAtom = 25;

class Saver {
    private go = true
    private queue: Atom[] = []

    enqueueSave(atom: Atom) {
        this.queue.push(atom)
    }

    run() {
        const atom = this.queue.pop();
    }
}



export type Row = {
    part: string,
    sort: string,
    [k: string]: any
}

export default class Atom {

    private upstreams: Atom[];
    private children: Atom[];
    private rows: any[];

    private state: AtomState = 'pending'

    constructor(upstreams: Atom[], rows: Row[]) {
        this.upstreams = upstreams;
        this.children = [];
        this.rows = rows;

        this.upstreams.forEach(a => a.children.push(this)); //not certain we need children here - what happens if we change our mind? should be up to us
    }

    async save(store: Store) {
        const roots = this.findUpstreams()
        
        await Atom.waitTillDone(roots);

        //now need to gather atoms forwards, by combining them

        //saves should continue till graph done

        if(roots.some(r => r.state != 'done')) {
            await Promise.all(roots.map(r => r.waitTillSaved()));
            await this.save(store);
        }
        else {
            const saveable = store.createSaveable();

            let result = saveable.tryCombine(this);
            if(result) {
                await result.save();
            }
        }

    }

    private findUpstreams(): Atom[] {
        switch(this.state) {
            case 'pending':
                return flatMap(this.upstreams, atom => atom.findUpstreams());
            
            case 'saving':
            case 'done':
                return [this];
        }
    }

    private waitTillSaved(): Promise<any> {
        throw Error();
    }

    private static waitTillDone(roots: Atom[]) {
        return Promise.resolve();
    }
}


//the Save is created and queued
//
export class Save {

    private atoms: Atom[];

    constructor(atoms: Atom[]) {
        this.atoms = atoms;
    }

    //atoms need to know their last 
    //
    //

}

export interface Saveable {
    save(): Promise<void>
    tryCombine(atom: Atom): Saveable|false
}

export interface Store {
    createSaveable(): Saveable
}

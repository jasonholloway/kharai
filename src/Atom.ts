import flatMap from 'lodash/flatMap'
import flatten from 'lodash/flatten'

type AtomState = 'ready' | 'claimed' | 'done'

export class AtomSaver {

    private store: Store;
    
    constructor(store: Store) {
        this.store = store;
    }

    async save(tip: Atom): Promise<void> {
        const claimed = await tip.claim();

        //claim our subtree
        //then try to save it
        //on success, empty out the atoms

        //atom and claim are siblings with separate interfaces
        //
        //

        

        
    }
}



export type Row = {
    part: string,
    sort: string,
    [k: string]: any
}

//the claimed atom is our way of changing atoms
//it is basically the atom tree in its nudity
//this means that the previously used Atom isn't the real atom at all:
//it's just a facade, and its debatable whether we even need to expose it
//what we do need to expose is the Tip, or rather the MachineContext that keeps track of the tip
//this then, behind the scenes, tries to claim portions of the tree and then pass these mutable fragments to the caller

export interface Claimed {
    readonly upstreams: Claimed[]
    rows: Row[]
    release(): void
}

export interface Claimable {
    claim(): Promise<Claimed[]>
}


export default class Atom {

    private upstreams: Atom[];
    private rows: any[];

    private state: AtomState = 'ready'

    constructor(upstreams: Atom[], rows: Row[]) {
        this.upstreams = upstreams;
        this.rows = rows;
    }

    private setState(state: AtomState) {
        this.state = state;
    }

    async claim(): Promise<Claimed[]> {
        switch(this.state) {
            case 'ready':
                const ups = flatten(await Promise.all(
                    this.upstreams.map(a => a.claim())));
                
                //at this point i've claimed all upstream that i can
                //now to try claiming myself: if i can't claim myself, all the parent claimeds need to be released

                switch(this.state) {
                    case 'ready':
                        const atom = this;
                        this.setState('claimed');
                        return [{
                            // atom,
                            upstreams: ups,
                            rows: [],
                            // complete() {
                            //     ups.forEach(c => c.complete());
                            //     atom.setState('done');
                            // },
                            release() {
                                ups.forEach(c => c.release());
                                atom.setState('ready');
                            }
                        }];
                }

                
                
                throw Error('yo');

            case 'claimed':
                

            case 'done':
                return [];
        }
    }

    private findRoots(): Atom[] {
        switch(this.state) {
            case 'ready':
                return flatMap(this.upstreams, atom => atom.findRoots());
            
            case 'claimed':
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

export interface Saveable {
    save(): Promise<void>
}

export interface Store {
    tryCreateSaveable(atom: Atom): Saveable|false
}

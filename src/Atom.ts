
const maxRowsPerAtom = 25;

export default class Atom {

    private parent: Atom|null;
    private children: Atom[];
    private rows: any[];

    constructor(parent: Atom|null, rows: any[]) {
        this.parent = parent;
        this.children = [];
        this.rows = rows;

        if(this.parent) {
            this.parent.children.push(this)
        }
    }
}

export class Save {

    private atoms: Atom[];

    constructor(atoms: Atom[]) {
        this.atoms = atoms;
    }

    //atoms need to know their last 
    //
    //

}

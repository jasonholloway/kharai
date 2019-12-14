import Atom, { Row, Saveable, Store, AtomSaver } from '../src/Atom'

describe('hello', () => {

    let store: FakeStore
    let saver: AtomSaver

    beforeEach(() => {
        store = new FakeStore();
        saver = new AtomSaver(store);
    })

    it('forms saveable from atoms', async () => {
        const atom1 = new Atom([], []);
        const atom21 = new Atom([atom1], []);
        const atom22 = new Atom([atom1], []);

        await saver.save(atom22);

        expect(store.saveables).toHaveLength(1);
        expect(store.saveables[0].atoms).toEqual(
            [ atom1, atom22 ]
        );
    })


})

class FakeStore implements Store {

    tryCreateSaveable(atom: Atom): false | Saveable {
        throw new Error("Method not implemented.");
    }

    readonly saveables: FakeSaveable[] = []

    createSaveable(): Saveable {
        const saveable = new FakeSaveable(this);
        this.saveables.push(saveable);
        return saveable;
    }    
}

class FakeSaveable implements Saveable {
    private store: FakeStore;

    readonly atoms: any[] = []

    constructor(store: FakeStore) {
        this.store = store;
    }

    tryCombine(atom: Atom): false | Saveable {
        return false;
    }
    
    save(): Promise<void> {
        throw new Error("Method not implemented.");
    }
}

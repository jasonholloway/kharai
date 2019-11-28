import Atom, { Row, Saveable, Store } from '../src/Atom'

describe('hello', () => {

    let store: FakeStore

    beforeEach(() => {
        store = new FakeStore();
    })

    it('forms saveable from atoms', async () => {
        const atom1 = new Atom([], []);
        const atom21 = new Atom([atom1], []);
        const atom22 = new Atom([atom1], []);

        await atom22.save(store);

        expect(store.saveables).toHaveLength(1);
        expect(store.saveables[0]).toEqual({
            atoms: [ atom1, atom22 ]
        });
    })

})

class FakeStore implements Store {

    readonly saveables: Saveable[] = []

    createSaveable(): Saveable {
        const saveable = new FakeSaveable(this);
        this.saveables.push(saveable);
        return saveable;
    }    
}

class FakeSaveable implements Saveable {
    private store: FakeStore;

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


class DynamoStore implements Store {
    createSaveable(): Saveable {
        throw new Error("Method not implemented.");
    }    
}

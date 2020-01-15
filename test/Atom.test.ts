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

        expect(store.saved).toHaveLength(1);
        expect(store.saved[0]).toEqual(
            [ atom1, atom22 ]
        );
    })


})

class FakeStore implements Store {

  saved: Atom[] = []

  prepareSave(atom: Atom): false | Saveable {
    //check size here
    //...
    
    return {
      save: async () => {
        this.saved.push(atom);
      }
    };
  }
}

import { Saver, Loader } from './Store'
import { DataMap, Id } from './lib'
import _Monoid from './_Monoid'
import { Map, Set } from 'immutable'

export default class FakeStore implements Loader, Saver<DataMap> {
  saved: DataMap;
  readonly batches: DataMap[] = []
  
  private _maxBatch: number;

  constructor(batchSize: number, data?: DataMap) {
    this._maxBatch = batchSize;
    this.saved = data ?? Map();
  }

  prepare(v: DataMap): {save():Promise<void>}|false {
    return v.count() <= this._maxBatch
      && {
        save: async () => {
          this.batches.push(v);
          this.saved = this.saved.merge(v);
        }
      };
  }

  async load(ids: Set<Id>) {
    return ids.reduce(
      (ac, id) => {
        const found = this.saved.get(id, undefined);
        return found
          ? ac.set(id, found)
          : ac.set(id, ['$boot']); //TODO this shouldn't be done here, but above
      },
      Map<Id, unknown>()
    );
  }

}

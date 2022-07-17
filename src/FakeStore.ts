import Store from './Store'
import { DataMap } from './lib'
import _Monoid from './_Monoid'
import { Map } from 'immutable'

export default class FakeStore extends Store<DataMap> {
  saved: DataMap = Map()
  readonly batches: DataMap[] = []
  
  private _maxBatch: number;

  constructor(monoid: _Monoid<DataMap>, batchSize: number) {
    super(monoid);
    this._maxBatch = batchSize;
  }

  prepare(v: DataMap): {save():Promise<void>}|false {
    return v.count() <= this._maxBatch
      && {
        save: () => {
          this.batches.push(v);
          this.saved = this.saved.merge(v);
          return Promise.resolve();
        }
      };
  }
}

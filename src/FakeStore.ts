import Store from './Store'
import { Data } from './lib'
import _Monoid from './_Monoid'
import { Map } from 'immutable'

export default class FakeStore extends Store<Data> {
  saved: Data = Map()
  readonly batches: Data[] = []
  
  private _maxBatch: number;

  constructor(monoid: _Monoid<Data>, batchSize: number) {
    super(monoid);
    this._maxBatch = batchSize;
  }

  prepare(v: Data): {save():Promise<void>}|false {
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

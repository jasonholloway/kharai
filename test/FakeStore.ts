import Store from '../src/Store'
import { Data } from '../src/lib'
import _Monoid from '../src/_Monoid'
import { Map } from 'immutable'

export default class FakeStore extends Store<Data> {
  saved: Data = Map()
  private _maxBatch: number;

  constructor(monoid: _Monoid<Data>, batchSize: number) {
    super(monoid);
    this._maxBatch = batchSize;
  }

  prepare(v: Data): {save():Promise<void>}|false {
    return v.count() <= this._maxBatch
      && {
        save: () => {
          console.log('saving', v)
          this.saved = this.saved.merge(v);
          return Promise.resolve();
        }
      };
  }
}

import Store from '../src/Store'
import { Data } from '../src/lib'
import _Monoid from '../src/_Monoid'
import { Map } from 'immutable'

export default class FakeStore extends Store<Data> {
  saved: Data = Map()
  readonly batches: Data[] = []
  
  private _maxBatch: number;
  private _i = 0;

  constructor(monoid: _Monoid<Data>, batchSize: number) {
    super(monoid);
    this._maxBatch = batchSize;
  }

  prepare(v: Data): {save():Promise<void>}|false {
    return v.count() <= this._maxBatch
      && {
        save: () => {
          // console.log('saving', this._i++, v)
          this.batches.push(v);
          this.saved = this.saved.merge(v);
          return Promise.resolve();
        }
      };
  }
}

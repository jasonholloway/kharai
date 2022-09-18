import { Saver, Loader } from './Store'
import { RawDataMap, Id, DataMap } from './lib'
import _Monoid from './_Monoid'
import { Map, Set } from 'immutable'

export class FakeLoader implements Loader {
  getData: ()=>RawDataMap;

  constructor(arg: RawDataMap|(()=>RawDataMap)) {
    this.getData =
      typeof(arg) === 'function'
      ? arg
      : () => arg;
  }

  async load(ids: Set<Id>) {
    return ids.reduce(
      (ac, id) => {
        const data = this.getData();
        const found = data.get(id, undefined);
        return found
          ? ac.set(id, found)
          : ac.set(id, ['boot']); //TODO this shouldn't be done here, but above
      },
      Map<Id, unknown>()
    );
  }
}

export default class FakeStore implements Loader, Saver<DataMap> {

  saved: RawDataMap;
  readonly batches: RawDataMap[] = []
  
  private _loader: FakeLoader;
  private _maxBatch: number;

  constructor(maxBatch: number, data?: RawDataMap) {
    this._maxBatch = maxBatch;
    this.saved = data ?? Map();
    this._loader = new FakeLoader(() => this.saved);
  }

  load = (ids: Set<Id>) => this._loader.load(ids);

  prepare(v: DataMap): {save():Promise<void>}|false {
    return v.count() <= this._maxBatch
      && {
        save: async () => {
          const rawified = v.map(({data}) => data);
          this.batches.push(rawified);
          this.saved = this.saved.merge(rawified);
        }
      };
  }
}

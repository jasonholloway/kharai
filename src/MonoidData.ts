import _Monoid from './_Monoid'
import { DataMap } from './lib'
import { Map } from 'immutable'

export default class MonoidData implements _Monoid<DataMap> {
  zero: DataMap = Map()
  add(a: DataMap, b: DataMap): DataMap {
    return a.merge(b);
  }
}

//todo
//could do with nice way of skipping identical phases that change nothing
//if the data of the machine has not changed,
//then we can remove it from the commit
//either by a special return type
//or a check (we should always know the preceding state)
//we can check for identity in the runner itself
//we can check for identity in the store on compaction

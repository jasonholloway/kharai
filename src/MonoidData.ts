import _Monoid from './_Monoid'
import { DataMap } from './lib'
import { Map } from 'immutable'

export default class MonoidData implements _Monoid<DataMap> {
  zero: DataMap = Map()
  add(a: DataMap, b: DataMap): DataMap {
    return a.merge(b);
  }
}

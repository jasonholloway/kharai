import _Monoid from './_Monoid'
import { Data } from './lib'
import { Map } from 'immutable'

export default class MonoidData implements _Monoid<Data> {
  zero: Data = Map()
  add(a: Data, b: Data): Data {
    return a.merge(b);
  }
}

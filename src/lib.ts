import { Map } from 'immutable'
import { Found } from './shape/BuiltWorld'

export type DataMap = Map<string, { data: Data, phase?: Found }>
export type RawDataMap = Map<string, Data>
export type Data = [string, unknown];
export type Id = string

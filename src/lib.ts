import { Map } from 'immutable'
import { Found } from './shape/BuiltWorld'

export type Id = string;
export type Path = string;

export type DataMap = Map<Id, { data: Data, phase: Found }>;
export type RawDataMap = Map<Id, Data>;
export type Data = [Path, unknown?];

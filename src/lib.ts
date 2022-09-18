import { Map } from 'immutable'
import { Found } from './shape/BuiltWorld'

export type Id = string;
export type Path = string;

export type DataMap = Map<Id, { data: PhaseData, phase: Found }>;
export type RawDataMap = Map<Id, PhaseData>;
export type PhaseData = [Path, unknown?];

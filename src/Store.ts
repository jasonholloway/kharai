import { Id } from "./lib";
import { Map, Set } from 'immutable'

export interface Saver<V> {
	prepare(v: V): {save(): Promise<void>}|false;
}

// the monoid of commits
// is fine - we will load the same monoid
// but to do so we need a matching monoid of ids

export interface Loader {
	load(ids: Set<Id>): Promise<Map<Id, unknown>>
}

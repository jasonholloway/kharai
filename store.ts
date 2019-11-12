import { DynamoDB } from "aws-sdk";
import { Config } from "./config";
import { AttributeMap } from "aws-sdk/clients/dynamodb";

// what'll it do?
// it will load states for you, which you can update, and commit new versions of
// that supports the existing behaviour

// but - as well as saving and loading, 
// should keep track of all entities loaded and saved
// then 

//currently, the version gets updated every time a phase gets dispatched - but this is right!
//every time the state is updated, the version should be incremented
//

type InnerStorable<S> = {
    id: string,
    version: number,
    db: { version: number },
    state: S,
    hooks: Hook<S>[],
    setState(s: S): void,
    freeze(): void,
    frozen: boolean
}

export interface Storable<S> extends Omit<Readonly<InnerStorable<S>>, 'db'>
{}

export type DbMap<S> = {
    load(x: AttributeMap): S,
    save(state: S): AttributeMap
}

type HookFn<S> = (this: Hook<S>, x: Storable<S>) => void;
type Hook<S> = {
    readonly fn: HookFn<S>
    complete(result: boolean): void
}

//as soon as a hook is placed, it should be checked
//and perhaps fired
//
//question now is of triggering hooks
//setting a watch should implicitly load the state - but this canbe done later
//we should certainly fire as soon as set if state is in good nick
//
//so, when the hook is set we must test what's already loaded,
//and every time the loaded changes
//

const createStore = (config: Config, dynamo: DynamoDB) => {
    let go = true;
    const loaded: { [id: string]: Storable<any> } = {};

    const createRepo = <S>(map: DbMap<S>) => {
        return {
            load: (id: string): Promise<Storable<S>> => {
                console.log('loading', id)


                if(!go) throw Error('store closed');

                return dynamo.getItem({
                    TableName: config.tableName,
                    Key: {
                        part: { S: id }
                    }
                })
                .promise()
                .then(({ Item: x }) => {
                    if(!x) throw Error('undefined Item from DynamoDB');

                    const version = x && x.version 
                            ? parseInt(x.version.N || '0') 
                            : 0;

                    const storable: InnerStorable<S> = { 
                        id, 
                        version, 
                        db: { version },
                        state: map.load(x),
                        hooks: [],
                        frozen: false,
                        setState(s) {
                            storable.state = s;
                            storable.version++;
                            storable.hooks.forEach(h => h.fn(storable));
                        },
                        freeze() {
                            this.frozen = true;
                            this.hooks.forEach(h => h.complete(false));
                        }
                    };

                    console.log('loaded', storable)
                    loaded[id] = storable;

                    return storable;
                })
            },

            async save(storables: Storable<S>[]): Promise<void> {
                const pendings = 
                    (<InnerStorable<S>[]>storables)
                        .filter(s => s.version > s.db.version);

                if(pendings.length === 0) return;
                else {
                    const items = pendings
                        .map(s => ({
                            ...map.save(s.state),
                            part: { S: s.id },
                            version: { N: s.version.toString() }
                        }))

                    await dynamo.transactWriteItems({
                        TransactItems: items.map(item => ({
                            Put: {
                                TableName: config.tableName,
                                Item: item,
                                ConditionExpression: 'version < :version',
                                ExpressionAttributeValues: { ':version': item.version }
                            }
                        }))
                    })
                    .promise();

                    pendings.forEach(s => s.db.version = s.version)
                }
            },

            watch: (id: string, fn: HookFn<S>) =>
                new Promise<boolean>((resolve) => {
                    const s = loaded[id];

                    if(go && !s.frozen) {
                        console.log('watching', id)
                        const hook: Hook<S> = { 
                            fn,
                            complete(result) {
                                console.log('hook complete', id);
                                s.hooks.splice(s.hooks.indexOf(hook), 1);
                                resolve(result);
                            }
                        }
                        s.hooks.push(hook);
                        hook.fn(s);

                        //****
                        //very much reliant on target already being loaded
                        //****
                    }
                    else {
                        resolve(false);
                    }
                })
        }
    }

    const endAllWatches = () => {
        go = false;
        Object.values(loaded)
            .forEach(r => r.freeze());
    }

    return {
        createRepo,
        endAllWatches
    }
}

export default createStore;
export type Store = ReturnType<typeof createStore>

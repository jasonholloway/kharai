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
    setState(s: S): void
}

export type Storable<S> = Omit<Readonly<InnerStorable<S>>, 'db'>

export type DbMap<S> = {
    load(x: AttributeMap): S,
    save(state: S): AttributeMap
}

type HookFn<S> = (s: Storable<S>) => void;
type Hook<S> = {
    readonly fn: HookFn<S>
    remove(): void
}

//as soon as a hook is placed, it should be checked
//and perhaps fired
//

const createStore = (config: Config, dynamo: DynamoDB) => {
    const loaded: { [id: string]: Storable<any> } = {};
    const hooks: { [id: string]: Hook<any>[] } = {};

    function watch<S>(id: string, fn: HookFn<S>) {
        const r = hooks[id] || (hooks[id] = []);

        const hook = { 
            fn,
            remove() {
                r.splice(r.indexOf(hook), 1)
            }
        }

        r.push(hook);

        //this is the one way of reading state,
        //and so it should return current state, as soon as it was loaded (and this marks a need for it)

        //but such a hook could fire a fair few times...
        //the setter of the hook would filter out the states that weren't sufficient for it
        //and unregister itself after the first hit
        //then we here would just be in the business of *streaming* updates for states out

        //so the runner sets watches with its conditions and *unhooks* on first pass
        //

        //hook is set: do we now need to fire for it?
        //the hook will emit events
        //watching is the main means of reading another's state...

        return hook;
    }

    const createRepo = <S>(map: DbMap<S>) => {

        return {
            load: (id: string): Promise<Storable<S>> =>
                dynamo.getItem({
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
                        setState(s) {
                            storable.state = s;
                            storable.version++;
                        }
                    };

                    loaded[id] = storable;

                    return storable;
                }),

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
            }

        }
    }

    return {
        createRepo,
        watch
    }
}

export default createStore;
export type Store = ReturnType<typeof createStore>

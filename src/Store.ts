import { DynamoDB } from "aws-sdk";
import { Config } from "./config";
import { AttributeMap } from "aws-sdk/clients/dynamodb";
import { EventEmitter } from "events";

const log = (...args: any[]) => console.log('Store:', ...args);

type InnerStorable<S> = {
    id: string,
    version: number,
    db: { version: number },
    dbMap: DbMap<S>,
    state: S,
    setState(s: S): void,
}

export interface Storable<S> extends Omit<Readonly<InnerStorable<S>>, 'db' | 'dbMap'>
{}

export type DbMap<S> = {
    load(x: AttributeMap): S,
    mapToDb(state: S): AttributeMap
}

//closing a store should do what?
//no resumptions are being managed...

export default class Store {
    private config: Config;
    private dynamo: DynamoDB;
    private go = true;
    private cache: { [id: string]: Promise<InnerStorable<any>> } = {}; //should also cache in files

    constructor(config: Config, dynamo: DynamoDB) {
        this.config = config;
        this.dynamo = dynamo;
    }

    load<S>(id: string, dbMap: DbMap<S>): Promise<Storable<S>> {  //should load many at once
        if(!this.go) throw Error('store closed');

        return this.cache[id] || (this.cache[id] = (async () => {
            const { Item: x } = await this.dynamo.getItem({
                TableName: this.config.tableName,
                Key: {
                    part: { S: id }
                }
            })
            .promise();

            if(!x) throw Error('undefined Item from DynamoDB');

            const version = x && x.version 
                    ? parseInt(x.version.N || '0') 
                    : 0;

            const storable: InnerStorable<S> = { 
                id, 
                version, 
                db: { version },
                dbMap,
                state: dbMap.load(x),
                setState(s) {
                    storable.state = s;
                    storable.version++;
                },
            };

            log('loaded', storable)

            return storable;
        })())
    }

    //should just save all in cache here - if it's loaded and changed, then we have to save it
    //but in this, we also have to communicate back that we can't save any more in one transaction,
    //via a return value from setState

    //the store must track how many storables need saving
    //as soon as there are 25, we can't save
    //
    //but saves may be queued up, and as yet unexecuted...
    //in which case, it would be possible to just wait when setting state
    //if we have too many changes queued up
    //then we could just insist on flushing, ie saveAlling, when we set state

    //the problem with this is that, in trying to be transparent, it lets the machines
    //continue as if there were no problem to solve, as it is solved for them, and what
    //they could themselves do to improve the situation is thereby excluded
    //ie. it'd be best if machines persisted themselves when the buffer was full, so they
    //could resume reliably via timely persistence

    //so, setState should say that it can or cannot set a state, because a save must first be performed
    //fair enough - but machines are privileged in that must always have space to be saved(?)

    //if machines themselves aren't privileged like this, there's nothing that can be done when we are told
    //the buffer is full; so each loaded machine reserves its savability

    //----------------------------------------------

    //there was a problem with all this that i've now forgotten
    //maybe the problem was that I need to focus and to simplify
    //there was something that didn't add up with the delay before saving
    //
    //no, again it seems fine: when we have emplaced too many things to save,
    //then something must saveAll before we can continue; setState is the threshold point
    //it is this point that commits us to saving
    //
    //the problem came with concurrent nature of the background saving; but this is ok -
    //
    //the store needs 


    private activeSaves = 0;
    private saving: Promise<any> = Promise.resolve();

    private events = new EventEmitter();
    private completing = new Promise((resolve, reject) => {
        this.events
            .on('saved', () => !this.go && this.activeSaves == 0 && resolve())
            .on('error', reject)
    })

    async saveAll(): Promise<void> {
        this.activeSaves++;

        const storables = await Promise.all(Object.values(this.cache)) 
        const pendings = storables.filter(s => s.version > s.db.version);

        if(pendings.length == 0) {
            this.activeSaves--;
            this.events.emit('tick')
        }
        else {
            const items = pendings
                .map(s => ({
                    ...s.dbMap.mapToDb(s.state),
                    part: { S: s.id },
                    version: { N: s.version.toString() }
                }))

            await this.saving;

            await (this.saving = (async () => {
                    await this.dynamo.transactWriteItems({
                        TransactItems: items.map(item => ({
                            Put: {
                                TableName: this.config.tableName,
                                Item: item,
                                ConditionExpression: 'version < :version',
                                ExpressionAttributeValues: { ':version': item.version }
                            }
                        }))
                    }).promise() 

                    pendings.forEach(s => s.db.version = s.version)

                    this.activeSaves--;
                    this.events.emit('tick')
                })()
                .catch(er => {
                    this.events.emit('error', er);
                    throw er;
                }));
        }
    }

    complete(): Promise<any> {
        this.go = false;
        return this.activeSaves == 0 
            ? Promise.resolve()
            : this.completing;
    }
}
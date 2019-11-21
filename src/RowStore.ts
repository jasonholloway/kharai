import { DynamoDB } from "aws-sdk";
import { Config } from "./config";
import { AttributeMap } from "aws-sdk/clients/dynamodb";
import { EventEmitter } from "events";

const log = (...args: any[]) => console.log('Store:', ...args);

type InnerStorable<S> = {
    type: string,
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

export default class RowStore {
    private config: Config;
    private dynamo: DynamoDB;
    private go = true;
    private cache: { [id: string]: Promise<InnerStorable<any>> } = {}; //should also cache in files

    constructor(config: Config, dynamo: DynamoDB) {
        this.config = config;
        this.dynamo = dynamo;
    }

    load<S>(type: string, id: string, dbMap: DbMap<S>): Promise<Storable<S>> {  //should load many at once
        if(!this.go) throw Error('store closed');

        return this.cache[id] || (this.cache[id] = (async () => {
            const { Item: x } = await this.dynamo.getItem({
                TableName: this.config.tableName,
                Key: {
                    part: { S: type },
                    sort: { S: id }
                }
            })
            .promise();

            if(!x) throw Error('undefined Item from DynamoDB');

            const version = x && x.version 
                    ? parseInt(x.version.N || '0') 
                    : 0;

            const storable: InnerStorable<S> = { 
                type,
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

        log(`saveAll (active=${this.activeSaves})`)

        const storables = await Promise.all(Object.values(this.cache))

        await (this.saving = this.saving
            .then(async () => {
                const pendings = storables.filter(s => s.version > s.db.version);

                if(pendings.length == 0) {
                    this.activeSaves--;
                    this.events.emit('tick')
                }
                else {
                    log('saving', pendings.map(p => [p.version, p.db.version]))

                    const items = pendings
                        .map(s => ({
                            ...s.dbMap.mapToDb(s.state),
                            part: { S: s.type },
                            sort: { S: s.id },
                            version: { N: s.version.toString() }
                        }))

                    await this.dynamo.transactWriteItems({
                        TransactItems: items.map(item => ({
                            Put: {
                                TableName: this.config.tableName,
                                Item: item,
                                ConditionExpression: 'version < :version',
                                ExpressionAttributeValues: { ':version': item.version }
                            }
                        }))
                    }).promise(); 

                    pendings.forEach(s => s.db.version = s.version)

                    this.activeSaves--;
                    this.events.emit('tick')
                }
            })
            .catch(er => {
                this.events.emit('error', er);
                throw er;
            })
            .finally(() => log('save done')))
    }

    complete(): Promise<any> {
        this.go = false;
        return this.activeSaves == 0 
            ? Promise.resolve()
            : this.completing;
    }
}
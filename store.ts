import { DynamoDB } from "aws-sdk";
import { Config } from "./config";
import { AttributeMap } from "aws-sdk/clients/dynamodb";

// what'll it do?
// it will load states for you, which you can update, and commit new versions of
// that supports the existing behaviour
//

export type Storable = {
    id: string,
    version: number,
    db: { version: number }
}

export type DbMap<V extends Storable> = {
    load(base: Storable, x: AttributeMap): V,
    save(attr: AttributeMap, v: V): AttributeMap
}


const createStore = (config: Config, dynamo: DynamoDB) => {

    const createClient = <V extends Storable>(map: DbMap<V>) =>
        ({
            load: (id: string): Promise<V> =>
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

                    const base = { 
                        id, 
                        version, 
                        db: { version }
                    }

                    return map.load(base, x)
                }),

            async save(storables: V[]): Promise<void> {
                const pendings = storables
                    .filter(s => s.version > s.db.version);

                if(pendings.length === 0) return;
                else {
                    const items = pendings
                        .map(s => map.save({  
                            part: { S: s.id },
                            version: { N: s.version.toString() }
                        }, s));

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
        })

    return {
        createClient
    }
}

export default createStore;
export type Store = ReturnType<typeof createStore>

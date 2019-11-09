import { DynamoDB } from "aws-sdk";
import { Config } from "./config";
import { AttributeMap } from "aws-sdk/clients/dynamodb";

// what'll it do?
// it will load states for you, which you can update, and commit new versions of
// that supports the existing behaviour
//

export type Storable<S> = {
    id: string,
    version: number,
    db: { version: number },
    state: S
}

export type DbMap<S> = {
    load(x: AttributeMap): S,
    save(state: S): AttributeMap
}


const createStore = (config: Config, dynamo: DynamoDB) => {

    const createClient = <S>(map: DbMap<S>) =>
        ({
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

                    return { 
                        id, 
                        version, 
                        db: { version },
                        state: map.load(x)
                    };
                }),

            async save(storables: Storable<S>[]): Promise<void> {
                const pendings = storables
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
        })

    return {
        createClient
    }
}

export default createStore;
export type Store = ReturnType<typeof createStore>

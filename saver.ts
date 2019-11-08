import { RunContext, Machine } from "./runner";
import { EventEmitter } from "events";
import { clone } from "./util";
import { DynamoDB } from "aws-sdk";
import { Config } from "./config";

const log = (...args: any[]) => console.debug('saver:', ...args);

const createSaver = (config: Config, dynamo: DynamoDB, run: RunContext) => {
    let go = true;
    let active = 0;
    let saving = Promise.resolve();
    const events = new EventEmitter();

    const complete = new Promise<void>((resolve, reject) => {
        events
            .on('saved', () => !go && active == 0 && resolve())
            .on('error', reject)
    })

    return {
        save(machines: Machine[]): void {
            if(!go) return;

            const captured = machines.map(m => ({ ...m, state: clone(m.state) }))

            active++;
            saving = saving.then(async () => {
                const pendings = captured
                    .filter(m => m.state.version > m.db.version);

                if(pendings.length === 0) return;
                else {
                    log('pendings', pendings)

                    await dynamo.transactWriteItems({
                        TransactItems: pendings.map(m => ({
                            Put: {
                                TableName: config.tableName,
                                Item: {
                                    part: { S: m.id },
                                    version: { N: m.state.version.toString() },
                                    phase: { S: m.state.phase },
                                    data: { S: JSON.stringify(m.state.data) },
                                    due: { N: m.state.due.toString() }
                                },
                                ConditionExpression: 'version < :version',
                                ExpressionAttributeValues: {
                                    ':version': { N: m.state.version.toString() }
                                }
                            }
                        }))
                    })
                    .promise();

                    pendings.forEach(m => m.db.version = m.state.version)
                }
            })
            .catch(err => {
                go = false;
                events.emit('error', err)
            })
            .finally(() => {
                active--;
                events.emit('saved');
            })
        },
        complete(): Promise<void> {
            go = false;
            return complete;
        }
    }
}

export default createSaver;
export type Saver = ReturnType<typeof createSaver>
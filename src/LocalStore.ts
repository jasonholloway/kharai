import { DataMap, Id } from './lib';
import { Loader, Saver } from './Store'
import { Map, Set } from 'immutable'
import fs from 'fs/promises'

export class LocalStore implements Loader, Saver<DataMap> {

 	async load(ids: Set<Id>): Promise<Map<Id, unknown>> {
    const loaded = await Promise.all(
      ids.valueSeq()
        .map(async id => {
          let h: fs.FileHandle;
          
          try {
            h = await fs.open( `./db/${id}`, 'r');
          }
          catch(e:any) {
            if(e.code == 'ENOENT') {
              //below boot should be supplied by above: we should just return false
              //(which means data should be nested in tuple)
              return [id, ['boot']] as [string, unknown];
            }

            throw e;
          }

          try {
            const raw = await h.readFile({ encoding: 'utf8' });
            const data = JSON.parse(raw);
            return [id, data] as [string, unknown];
          }
          finally {
            h.close();
          }
        })
    );

    //rough above
    //should open file handle once
    //need to validate shape

    return Map(loaded);
  }

 	prepare(dataMap: DataMap): {save(): Promise<void>}|false {
    //if datamap is too big to save, then we say 'no'. No pushback for current crap mechanism however.
    //really... we want to save lump to a staging file to give us atomicity across files
    //but... we're just going to loop through them one by one
    console.log(Date.now(), 'Preparing');
    return {
      async save() {
        await Promise.all(
          dataMap.entrySeq()
            .map(async ([id, data]) => {
              const path = `./db/${id}`;
              const raw = JSON.stringify(data);

              console.log(Date.now(), 'Saving', raw);
              await fs.writeFile(path, raw);
            })
        );
      }
    }
  }
}

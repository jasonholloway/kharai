import { Many, Guard, Narrowable, Or, Tup } from "../guards/Guard";
import { act } from "../shape/common";
import { World } from "../shape/World";
import { Set } from 'immutable'

export default <T extends Narrowable>(t:T) =>
  World
    .shape({
      ...act(),
      run: act(Many(t)),
    })
    .ctx(({expandType}) => ({
      isCommand: Guard(Or(
        Tup('add', expandType(t)),
        Tup('delete', expandType(t))
      ))
    }))
    .impl({
      async act({and}) {
        return and.run([]);
      },

      run: {
        async act({and,attend,isCommand}, data) {
          const [next] = await attend(m => {
            if(isCommand(m)) {
              const [cmd, v] = m;

              switch(cmd) {
                case 'add':
                  //MOST NAFF!!!
                  const nextData = Set([...data, v]).toJSON();
                  return [and.run(nextData), true];
                case 'delete':
                  return [and.run(data), true];
              }
            }

            return [and.skip()];
          }) || [];

          return next!;
        },

        show(d) {
          return [d];
        }
      }
    })
    .seal();

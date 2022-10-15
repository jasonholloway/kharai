import { Dict, Str, Guard, Or, Tup } from "../guards/Guard";
import { act } from "../shape/common";
import { World } from "../shape/World";

export default () =>
  World
    .shape({
      ...act(),
      run: act(Dict(true)),
    })
    .ctx(() => ({
      isCommand: Guard(Tup(Or('add','delete'), Str))
    }))
    .impl({
      async act({and}) {
        return and.run({});
      },

      run: {
        async act({and,attend,isCommand}, data) {
          const [next] = await attend(m => {
            if(isCommand(m)) {
              const [cmd, str] = m;

              switch(cmd) {
                case 'add':
                  return [and.run({ ...data, [str]: true }), true];
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

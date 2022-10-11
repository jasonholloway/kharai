import { Guard, Many, Narrowable, Or, Tup } from "../guards/Guard";
import { act } from "../shape/common";
import { World } from "../shape/World";

export default <T extends Narrowable>(t:T) =>
  World
    .shape({
      $summon: act(),
      run: act(Many(t)),
    })
    .ctx(({expandType}) => ({
      isCommand: Guard(Tup(Or('add','delete'), expandType(t)))
    }))
    .impl({
      async $summon({and}) {
        return and.run([]);
      },

      run: {
        async act({and,attend,isCommand}, data) {
          const [next] = await attend(m => {
            if(isCommand(m)) {
              const [cmd, str] = m;

              switch(cmd) {
                case 'add':
                  return [
                    [...data, str],
                    true
                  ];
                case 'delete':
                  return [
                    data,
                    true
                  ];
              }
            }

            return false;
          }) || [];

          return and.run(next ?? data);
        },

        show(d) {
          return [d];
        }
      }
    })
    .seal();

import { Api } from "../apis/Api";
import { Dict, Str, Bool, Guard, Or, Tup } from "../guards/Guard";
import { act } from "../shape/common";
import { World } from "../shape/World";

//binding itself has a result
//but, when binding, we want to be sure that communication is possible,
//if only after a time
//we try to bind to another
//and either we succeed or we fail
//or we repeatedlty attempt to rebind
//the repeated, timed return
//is like a retry policy
//
//

const api = Api({
  put: [Str],
  remove: [Str],
  has: [Str, Api({
    result: [true]
  })]
})


const isCommand = Guard(Or(
  Tup('put', Str),
  Tup('delete', Str),
  Tup('has', Str)
));

export default () =>
  World
    .shape({
      ...act(),
      run: act(Dict(Bool)),
    })
    .impl({
      async act({and}) {
        return and.run({});
      },

      run: {
        act({and,attend}, data) {
          return attend(m => {
            if(isCommand(m)) {
              const [cmd, str] = m;

              switch(cmd) {
                case 'put':
                  return [and.run({ ...data, [str]: true }), true];
                case 'delete':
                  return [and.run({ ...data, [str]: false }), true];
                case 'has':
                  return [and.skip(), !!data[str]];
              }
            }

            return [and.skip()];
          }).ok();
        },

        show(d) {
          return [d];
        }
      }
    })
    .seal();

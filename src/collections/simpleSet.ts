import { Many, Guard, Narrowable, Or, Tup } from "../guards/Guard";
import { act } from "../shape/common";
import { World } from "../shape/World";
import { Call } from "../SimpleCall"
import { Set } from 'immutable'

export namespace Calls {
  const Add = Call()
}


//to handle generic contracts
//need a canonical representation of contracts

//or, the below needs to be paramerised with the contract itself
//so, a Contract that defines the interface of a SimpleSet<Num>

//it's like the contract should actually be part of the tree
//so when referring to this special kind of node, it always abides by the contract
//you summon simpleSet('AnimalNames', Str)
//which already has everything tied down

//
//


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
        act({and,attend,isCommand}, data) {
          return attend(m => {
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
          }).ok();
        },

        show(d) {
          return [d];
        }
      }
    })
    .seal();

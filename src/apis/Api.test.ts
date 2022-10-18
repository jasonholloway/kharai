import { Num, Str } from '../guards/Guard'
import { act } from '../shape/common';
import { World } from '../shape/World';
import { Api, ReadApi } from './Api'
import { makeClient, makeServer } from './clients'

const SetApi = Api({
  put: [Str],
  remove: [Str],
  count: [,Num],
  has: [Str, Api({
    result: [Num, Api({
      confirm: []
    })],
    nope: []
  })]
})

// const client = makeClient(SetApi);

// const server = makeServer(SetApi, {
//   put(k) { return [] },
//   remove(k) { return [] },
//   count() {
//     return [,13];
//   },
//   has(k) {
//     return [,
//       ['result', 7, { confirm() { } }]
//     ];
//   }
// });


// needed for summon(): a hook on the RunCtx

function summon(id: string): Promise<unknown> {
  throw 123;
}

function bind<A extends Api<unknown>>(id:string, api:A): Promise<ReadApi<A>> {
  throw 123;
}


xdescribe('comms', () => {

  it('blah', async () => {
    const w = World
      .shape({
        newt: act(),
        frog: act()
      })
      .impl({
        async newt({and}) {
          const fred0 = await summon('Fred');
          
          const fred = await bind('Fred', SetApi);

          const c = fred.count();
          
          return and.end('fin');
        },

        async frog({attend}) {
          await attend(m => {
            m
            return false;
          });

          return false;
        }
      });
  })
})


// WOT U NEED
// a summon() method that establishes convo with a server
// without need for a callback to be supplied in the client
//
// bind then becomes a specialisation of this
// the closing of the convo becomes hooked in to the call context then
// 
// but on the server side, it's all enclosed as normal
// so its a client-side specialisatoin
//
// this turning inside-out would be progress here, but inessential
// 
// tho: if we get summon in place, it would be a big step towards niceness
// and the lack of api may become palatable











//we could do the whole api thing in just one phase of a 'chat'
//communication would then be direct
//but this would recreate the same system
//we want one plce to do one thing

// so if it is to be embedded,
// we pass messages, instead of direct calls
// these messages are simple tuples
// in fact they are what are returned already

// this scheme means two partedness, with connecting bus inbetween
// serverside produces an Attendee/Attended
// clientside produces a Convener/Convened
//
// the convener makes first contact
// and checks that a suitable api is available
// so again here we have this two-sidedness
//
// 
//
//


// xdescribe('apis', () => {

//   it('conversation via simple proxy', () => {
//     const r = client.count();
//     r

//     const v = server.has('boo');

//     switch(v[0]) {
//       case 'nope': throw 123;
//       case 'result': throw 123;
//     }




//     //need some kind of test mechanism here:
//     //
//     //
//     //


//   })
  
// })

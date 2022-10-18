import { Attendee, Convener } from '../MachineSpace';
import { Api, ReadApi, ReadServerApi } from './Api'


export function makeClient<A extends Api<unknown>>(api:A): ReadApi<A> {
  throw 123;
}

export function makeServer<A extends Api<unknown>>(api:A, impl: ReadServerApi<A>): ReadApi<A> {
  throw 123;
}


export function makeConvener<A extends Api<unknown>>(api:A): Convener<false|[unknown]> {
  throw 123;
}

export function makeAttendee<A extends Api<unknown>>(api:A, impl: ReadServerApi<A>): Attendee<unknown> {
  throw 123;
}



export module Basic {
  export function makeConvener(fn: ()=>void): Convener<false|[unknown]> {
    throw 123;
  }

  export function makeAttendee(fn: (m:unknown)=>unknown): Attendee<unknown> {
    throw 123;
  }
}

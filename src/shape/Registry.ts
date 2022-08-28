import { List, Map, Seq } from 'immutable'
import { Fac, Handler } from '../shapeShared';

export class Registry {
  private guards: Map<string, unknown> = Map();
  private handlers: Map<string, Handler> = Map();
  private facs: Map<string, Fac[]> = Map();

  private constructor(guards: Map<string, unknown>, handlers: Map<string, Handler>, facs: Map<string, Fac[]>) {
    this.guards = guards;
    this.handlers = handlers;
    this.facs = facs;
  }

  static empty = new Registry(Map(), Map(), Map());
  private static $notFound = Symbol('notFound');

  addGuard(p: string, guard: unknown): Registry {
    return new Registry(
      this.guards.set(p, guard),
      this.handlers,
      this.facs
    );
  }

  getGuard(p: string): [unknown] | undefined {
    const result = this.guards.get(p, Registry.$notFound);
    return result !== Registry.$notFound
      ? [result] : undefined;
  }

  addHandler(p: string, h: Handler): Registry {
    return new Registry(
      this.guards,
      this.handlers.set(p, h),
      this.facs
    );
  }

  getHandler(p: string): Handler | undefined {
    return this.handlers.get(p);
  }

  addFac(p: string, fac: Fac): Registry {
    return new Registry(
      this.guards,
      this.handlers,
      this.facs.mergeDeep({ [p]: [fac] })
   );
  } 

  getFacs(p: string): List<Fac> {
    return List(this.facs.get(p, []));
  } 

  getHandlerPaths() {
    return this.handlers.keys();
  }

  mapPaths(fn: ((orig:string)=>string)): Registry {
    return new Registry(
      this.guards.mapKeys(fn),
      this.handlers.mapKeys(fn),
      this.facs.mapKeys(fn)
    );
  }

  mapHandlers(fn: ((orig:Handler)=>Handler)): Registry {
    return new Registry(
      this.guards,
      this.handlers.map(fn),
      this.facs,
    );
  }

  dump() {
    console.debug([...this.handlers.keys()]);
  }

  static merge(a: Registry, b: Registry) {
    return new Registry(
      a.guards.merge(b.guards),
      a.handlers.merge(b.handlers),
      a.facs.mergeDeep(b.facs)
    );
  }
}

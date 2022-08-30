import { List, Map, Set } from 'immutable'
import { Fac, Handler } from '../shapeShared';

export class Registry {
  private nodes: Map<string, Node> = Map();

  private constructor(nodes: Map<string, Node>) {
    this.nodes = nodes;
  }

  static empty = new Registry(Map());

  addGuard(p: string, guard: unknown): Registry {
    return this.mapNode(p, n => n.setGuard(guard));
  }

  getGuard(p: string): [unknown]|undefined {
    return this.getFromNode(p, n => n.guard);
  }

  addHandler(p: string, h: Handler): Registry {
    return this.mapNode(p, n => n.setHandler(h));
  }

  prependAvailPaths(p: string, availPaths: Set<string>) {
    return this.mapNode(p, n => n.prependAvailPaths(availPaths.map(ap => <[string, string]>[ap,ap]).toList()));
  }

  appendAvailPaths(p: string, availPaths: Set<string>) {
    return this.mapNode(p, n => n.appendAvailPaths(availPaths.map(ap => <[string, string]>[ap,ap]).toList()));
  }

  getHandler(p: string): Handler|undefined {
    return this.getFromNode(p, n => n.handler);
  }

  addFac(p: string, fac: Fac): Registry {
    return this.mapNode(p, n => n.addFacs(fac));
  } 

  getFacs(p: string): List<Fac> {
    return this.getFromNode(p, n => List(n.facs)) ?? List();
  } 

  getDataPaths() {
    return this.nodes.entrySeq()
      .flatMap(([k,n]) => n.guard ? [k] : [])
      .toArray();
  }

  getHandlerPaths() {
    return this.nodes.entrySeq()
      .flatMap(([k,n]) => n.handler ? [k] : [])
      .toArray();
  }

  mapPaths(fn: ((orig:string)=>string)): Registry {
    return new Registry(
      this.nodes
        .mapKeys(fn)
        .map(n => n.mapAvailPaths(fn))
    );
  }

  mapHandlers(fn: ((orig:Handler,n:Node)=>Handler)): Registry {
    return new Registry(
      this.nodes
        .map(n => n.mapHandler(h => fn(h, n)))
    );
  }

  getAvailPaths(p: string) {
    return this.getFromNode(p, n => n.availPaths);
  }

  dump(tag:string) {
    for(const [k,n] of this.nodes.entries()) {
      console.debug('dump', tag, k, n.availPaths.toArray())
    }
  }

  private mapNode(p:string, fn: (n:Node)=>Node): Registry {
    const n0 = this.nodes.get(p, false) || Node.empty;
    const n1 = fn(n0);
    return new Registry(this.nodes.set(p, n1));
  }

  private getFromNode<T>(p:string, fn:(n:Node)=>T): T|undefined {
    const n = this.nodes.get(p, false);
    return n ? fn(n) : undefined;
  }

  static merge(a: Registry, b: Registry) {
    return new Registry(a.nodes.mergeWith(Node.merge, b.nodes));
  }
}

class Node {
  guard?: [unknown] = undefined;
  handler?: Handler = undefined;
  facs: Fac[] = [];
  availPaths: List<[string,string]> = List();

  constructor(guard:[unknown]|undefined, handler:Handler|undefined, facs:Fac[], paths:List<[string,string]>) {
    this.guard = guard;
    this.handler = handler;
    this.facs = facs;
    this.availPaths = paths;
  }

  static empty = new Node(undefined, undefined, [], List());

  setGuard(g:unknown) {
    return new Node([g], this.handler, this.facs, this.availPaths);
  }

  setHandler(h:Handler) {
    return new Node(this.guard, h, this.facs, this.availPaths);
  }

  addFacs(...fs:Fac[]) {
    return new Node(this.guard, this.handler, [...this.facs,...fs], this.availPaths);
  }

  prependAvailPaths(aps: List<[string,string]>) {
    return new Node(this.guard, this.handler, this.facs, aps.concat(this.availPaths));
  }

  appendAvailPaths(aps: List<[string,string]>) {
    return new Node(this.guard, this.handler, this.facs, this.availPaths.concat(aps));
  }

  mapAvailPaths(fn: (p:string)=>string) {
    return new Node(this.guard, this.handler, this.facs, this.availPaths.map(([a,z]) => [a, fn(z)]));
  }

  mapHandler(fn: (h:Handler)=>Handler) {
    return new Node(this.guard, this.handler ? fn(this.handler) : undefined, this.facs, this.availPaths);
  }

  static merge(a:Node, b:Node) {
    return new Node(
      b.guard ?? a.guard,
      b.handler ?? a.handler,
      [...a.facs, ...b.facs],
      a.availPaths.merge(b.availPaths)
    );
  }
}

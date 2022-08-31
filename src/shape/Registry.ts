import { List, Map, Stack } from 'immutable'
import { inspect } from 'util';
import { Fac, Handler } from '../shapeShared';

export type NodeVal = Readonly<{
  guard?: readonly [unknown],
  handler?: Handler,
  facs: List<Fac>
}>

export function mergeNodeVal(a: NodeVal, b: NodeVal) {
  return {
    guard: b.guard ?? a.guard,
    handler: b.handler ?? a.handler,
    facs: a.facs.concat(b.facs)
  };
}


class Node<V> {
  readonly val: V
  readonly children: Map<string,Node<V>>;

  constructor(val: V, children: Map<string,Node<V>>) {
    this.val = val;
    this.children = children;
  }

  show<T>(fn: (v:V)=>T): unknown {
    return this.children
      .reduce(
        (ac, c, k) => ({ ...ac, [k]: { v: fn(c.val), c: c.show(fn) } }),
        {}
      );
  }

  withVal(fn: (v:V)=>V): Node<V> {
    return new Node(fn(this.val), this.children);
  }

  withChildren(fn: (r:Map<string,Node<V>>)=>Map<string,Node<V>>) {
    return new Node(this.val, fn(this.children));
  }

  mergeWith(mergeFn: (a:V,b:V)=>V, other: Node<V>): Node<V> {
    const a = this.val;
    const b = other.val;

    return new Node(
      mergeFn(a, b),
      this.children.mergeWith((x,y)=>x.mergeWith(mergeFn, y), other.children)
    );
  }

  mapDepthFirst<B>(fn: (v: V, children: Map<string,B>, path: List<string>)=>B): Node<B> {
    return _map(this, List());

    function _map(n: Node<V>, path: List<string>): Node<B> {
      const children2 = n.children
        .map((c, k) => _map(c, path.push(k)));

      return new Node(fn(n.val, children2.map(c => c.val), path), children2);
    }
  }

  mapBreadthFirst<B>(fn: (v: V, ancestors: List<B>, path: List<string>)=>B): Node<B> {
    return _map(this, List(), List());

    function _map(n: Node<V>, l: List<B>, pl: List<string>): Node<B> {
      const b = fn(n.val, l, pl);
      return new Node(b, n.children.map((c,k) => _map(c, l.push(b), pl.push(k))));
    }
  }

  // setGuard(g:unknown) {
  //   return new Node([g], this.handler, this.facs, this.availPaths);
  // }

  // setHandler(h:Handler) {
  //   return new Node(this.guard, h, this.facs, this.availPaths);
  // }

  // addFacs(...fs:Fac[]) {
  //   return new Node(this.guard, this.handler, [...this.facs,...fs], this.availPaths);
  // }

  // prependAvailPaths(aps: List<[string,string]>) {
  //   return new Node(this.guard, this.handler, this.facs, aps.concat(this.availPaths));
  // }

  // appendAvailPaths(aps: List<[string,string]>) {
  //   return new Node(this.guard, this.handler, this.facs, this.availPaths.concat(aps));
  // }

  // mapAvailPaths(fn: (p:string)=>string) {
  //   return new Node(this.guard, this.handler, this.facs, this.availPaths.map(([a,z]) => [a, fn(z)]));
  // }

  // mapHandler(fn: (h:Handler)=>Handler) {
  //   return new Node(this.guard, this.handler ? fn(this.handler) : undefined, this.facs, this.availPaths);
  // }

  // static merge(a:Node, b:Node) {
  //   return new Node(
  //     b.guard ?? a.guard,
  //     b.handler ?? a.handler,
  //     [...a.facs, ...b.facs],
  //     a.availPaths.merge(b.availPaths)
  //   );
  // }
}

export class Registry {
  readonly root: Node<NodeVal>;

  constructor(root: Node<NodeVal>) {
    this.root = root;
  }

  static empty = new Registry(new Node({ facs: List() }, Map()));

  update(fn: (v:NodeView<NodeVal>) => NodeView<NodeVal>): Registry {
    return new Registry(fn(new NodeView(this.root)).done());
  }

  mergeWith(other: Registry): Registry {
    return new Registry(this.root.mergeWith(mergeNodeVal, other.root));
  }

  debug() {
    console.debug(inspect(this.root.show(v => true), { depth: 8 }));
  }

  // addGuard(p: string, guard: unknown): Registry {
  //   return this.mapNode(p, n => n.setGuard(guard));
  // }

  // getGuard(p: string): [unknown]|undefined {
  //   return this.getFromNode(p, n => n.guard);
  // }

  // addHandler(p: string, h: Handler): Registry {
  //   return this.mapNode(p, n => n.setHandler(h));
  // }

  // prependAvailPaths(p: string, availPaths: Set<string>) {
  //   return this.mapNode(p, n => n.prependAvailPaths(availPaths.map(ap => <[string, string]>[ap,ap]).toList()));
  // }

  // appendAvailPaths(p: string, availPaths: Set<string>) {
  //   return this.mapNode(p, n => n.appendAvailPaths(availPaths.map(ap => <[string, string]>[ap,ap]).toList()));
  // }

  // getHandler(p: string): Handler|undefined {
  //   return this.getFromNode(p, n => n.handler);
  // }

  // addFac(p: string, fac: Fac): Registry {
  //   return this.mapNode(p, n => n.addFacs(fac));
  // } 

  // getFacs(p: string): List<Fac> {
  //   return this.getFromNode(p, n => List(n.facs)) ?? List();
  // } 

  // getDataPaths() {
  //   return this.nodes.entrySeq()
  //     .flatMap(([k,n]) => n.guard ? [k] : [])
  //     .toArray();
  // }

  // getHandlerPaths() {
  //   return this.nodes.entrySeq()
  //     .flatMap(([k,n]) => n.handler ? [k] : [])
  //     .toArray();
  // }

  // mapPaths(fn: ((orig:string)=>string)): Registry {
  //   return new Registry(
  //     this.nodes
  //       .mapKeys(fn)
  //       .map(n => n.mapAvailPaths(fn))
  //   );
  // }

  // mapHandlers(fn: ((orig:Handler,n:Node)=>Handler)): Registry {
  //   return new Registry(
  //     this.nodes
  //       .map(n => n.mapHandler(h => fn(h, n)))
  //   );
  // }

  // getAvailPaths(p: string) {
  //   return this.getFromNode(p, n => n.availPaths);
  // }

  // dump(tag:string) {
  //   for(const [k,n] of this.nodes.entries()) {
  //     console.debug('dump', tag, k, n.availPaths.toArray())
  //   }
  // }

  // private mapNode(p:string, fn: (n:Node)=>Node): Registry {
  //   const n0 = this.nodes.get(p, false) || Node.empty;
  //   const n1 = fn(n0);
  //   return new Registry(this.nodes.set(p, n1));
  // }

  // private getFromNode<T>(p:string, fn:(n:Node)=>T): T|undefined {
  //   const n = this.nodes.get(p, false);
  //   return n ? fn(n) : undefined;
  // }

}


   
type Unwind<A> = (n:Node<A>)=>Node<A>;

export class NodeView<A> {
  private readonly stack: Stack<Unwind<A>>
  readonly node: Node<A>

  constructor(node:Node<A>, unwinds?:Stack<Unwind<A>>) {
    this.node = node;
    this.stack = unwinds ?? Stack();
  }

  summon(pl: string[], fac: ()=>A): NodeView<A> {
    return pl.reduce((v, p) => v.pushPath(p, fac), <NodeView<A>>this);
  }

  pushPath(p: string, fac:()=>A): NodeView<A> {
    const child = this.node.children.get(p, false) || new Node(fac(), Map());
    return new NodeView(
      child,
      this.stack.push(n2 => this.node.withChildren(r => r.set(p, n2)))
    );
  }

  popPath(): NodeView<A>|undefined {
    const fn = this.stack.peek();
    return fn ? new NodeView(fn(this.node), this.stack.pop()) : undefined;
  }

  update(fn: (v:A)=>A): NodeView<A> {
    return new NodeView(this.node.withVal(fn), this.stack);
  }

  mergeIn(mergeFn: (a:A,b:A)=>A, n: Node<A>): NodeView<A> {
    return new NodeView(this.node.mergeWith(mergeFn, n), this.stack);
  }


  // mapDepthFirst(fn: (n:NodeView)=>NodeView) {
    
    
  // }

  done(): Node<A> {
    return this.stack.reduce((n, fn) => fn(n), this.node);
  }
}





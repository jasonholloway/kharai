import { List, Map, Stack } from 'immutable'
import { inspect } from 'util';
import { Fac, Handler, Projector } from '../shapeShared';

export type NodeVal = Readonly<{
  guard?: readonly [unknown],
  handler?: Handler,
  projector?: Projector,
  facs: List<Fac>
}>

export function mergeNodeVal(a: NodeVal, b: NodeVal) {
  return {
    guard: b.guard ?? a.guard,
    handler: b.handler ?? a.handler,
    projector: b.projector ?? a.projector,
    facs: a.facs.concat(b.facs)
  };
}


class Node<V, V0 extends V = V> {
  readonly v0: V0;
  readonly val: V
  readonly children: Map<string,Node<V,V0>>;

  constructor(v0: V0, val?: V, children?: Map<string,Node<V,V0>>) {
    this.v0 = v0;
    this.val = val ?? v0;
    this.children = children ?? Map();
  }

  show<T>(fn: (v:V)=>T): unknown {
    return this.children.count() > 0
      ? {
          v: fn(this.val),
          c: this.children
              .reduce(
                (ac, c, k) => ({ ...ac, [k]: c.show(fn) }),
                {})
        }
      : { v: fn(this.val) } 
  }

  withVal(fn: (v:V)=>V): Node<V,V0> {
    return new Node(this.v0, fn(this.val), this.children);
  }

  withChildren(fn: (r:Map<string,Node<V,V0>>)=>Map<string,Node<V,V0>>) {
    return new Node(this.v0, this.val, fn(this.children));
  }

  mergeWith(mergeFn: (a:V,b:V)=>V, other: Node<V,V0>): Node<V,V0> {
    const a = this.val;
    const b = other.val;

    return new Node(
      this.v0,
      mergeFn(a, b),
      this.children.mergeWith((x,y)=>x.mergeWith(mergeFn, y), other.children)
    );
  }

  mapDepthFirst<B,B0 extends B = B>(b0:B0, fn: (v: V, children: Map<string,B>, path: List<string>)=>B): Node<B,B0> {
    return _map(this, List());

    function _map(n: Node<V,V0>, path: List<string>): Node<B,B0> {
      const children2 = n.children
        .map((c, k) => _map(c, path.push(k)));

      return new Node(
        b0,
        fn(n.val, children2.map(c => c.val), path),
        children2
      );
    }
  }

  mapBreadthFirst<B,B0 extends B = B>(b0:B0, fn: (v: V, ancestors: List<B>, path: List<string>)=>B): Node<B,B0> {
    return _map(this, List(), List());

    function _map(n: Node<V,V0>, l: List<B>, pl: List<string>): Node<B,B0> {
      const b = fn(n.val, l, pl);
      return new Node(
        b0,
        b,
        n.children.map((c,k) => _map(c, l.push(b), pl.push(k)))
      );
    }
  }
}

export class Registry {
  readonly root: Node<NodeVal>;

  constructor(root: Node<NodeVal>) {
    this.root = root;
  }

  static empty = new Registry(new Node({facs:List()}));

  update(fn: (v:NodeView<NodeVal>) => NodeView<NodeVal>): Registry {
    return new Registry(fn(new NodeView(this.root)).done());
  }

  mergeWith(other: Registry): Registry {
    return new Registry(this.root.mergeWith(mergeNodeVal, other.root));
  }

  debug() {
    console.debug(inspect(
      this.root.show(v => (v.guard ? 'G' : '') + (v.handler ? 'H' : '') + (v.projector ? 'P' : '')),
      { depth: 8 }
    ));
  }
}


   
type Unwind<A> = (n:Node<A>)=>Node<A>;

export class NodeView<A> {
  private readonly stack: Stack<Unwind<A>>
  readonly node: Node<A>

  constructor(node:Node<A>, unwinds?:Stack<Unwind<A>>) {
    this.node = node;
    this.stack = unwinds ?? Stack();
  }

  summon(pl: string[]): NodeView<A> {
    return pl.reduce((v, p) => v.pushPath(p), <NodeView<A>>this);
  }

  pushPath(p: string): NodeView<A> {
    const child = this.node.children.get(p, false) || new Node(this.node.v0);
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

  done(): Node<A> {
    return this.stack.reduce((n, fn) => fn(n), this.node);
  }
}





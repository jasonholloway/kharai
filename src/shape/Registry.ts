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

  done(): Node<A> {
    return this.stack.reduce((n, fn) => fn(n), this.node);
  }
}





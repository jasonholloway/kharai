import { Merge } from "./util";

let nextNodeId = 1;



export class _FacNode<A, B> {

  private fac: (a:A)=>B

  constructor(fac: (a:A)=>B) {
    this.fac = fac;
  }
  
  summon(a: A): B { throw 123 }

  static root<T>(): _FacNode<T, T> { return new _FacNode<T, T>((a) => a) };

  // static derive<A, C, D>(parent: FacNode<A, any, C>, fac: (c:C)=>D): FacNode<A, C, D> {
  //   return new FacNode<A, C, D>(a => parent.summon(a), fac);
  // }

  static derive<AR extends Many<FacNode<any, any, any>>, C, D>(uppers: AR, fac: (args:ConcatArgs<AR>)=>D): FacNode<NultiplySeeds<AR>, any, D> {
    return new FacNode<A, C, D>(a => parent.summon(a), fac);
  }
}

//
// root:  .    A->A
// node1: A->A A->B
// node2: B->C C->D
// node3: A->D D->E
//







export class FacNode<A, B, C> {

  private readonly nodeId = nextNodeId++;

  private source: (a:A)=>B;
  private fac: (b:B)=>C;
  private val: C|undefined;

  constructor(source: (a:A)=>B, derive: (b:B)=>C) {
    this.source = source;
    this.fac = derive;
  }

  summon(a: A): C {
    return this.val || (this.val = this.fac(this.source(a)));
  }

  static root<A>(): FacNode<A, A, A> { return new FacNode<A, A, A>((a) => a, (a) => a) };

  // static derive<A, C, D>(parent: FacNode<A, any, C>, fac: (c:C)=>D): FacNode<A, C, D> {
  //   return new FacNode<A, C, D>(a => parent.summon(a), fac);
  // }

  static derive<AR extends Many<FacNode<any, any, any>>, C, D>(uppers: AR, fac: (args:ConcatArgs<AR>)=>D): FacNode<NultiplySeeds<AR>, any, D> {
    return new FacNode<A, C, D>(a => parent.summon(a), fac);
  }
}

type Many<T, R extends T[] = T[]> = [T, ...R]

type NultiplySeeds<M extends Many<FacNode<any, any, any>>> =
  M extends [FacNode<infer T, any, any>, ...infer R]
  ? (R extends Many<FacNode<any, any, any>> ? Merge<T, NultiplySeeds<R>> : T)
  : never;

type ConcatArgs<M extends Many<FacNode<any, any, any>>> =
  M extends [FacNode<any, any, infer A>, ...infer R]
  ? (R extends Many<FacNode<any, any, any>> ? [A, ...ConcatArgs<R>] : [A])
  : never;


const root1 = FacNode.root<{ a: string }>();
const root2 = FacNode.root<{ b: string }>();

const n1 = FacNode.derive([root1, root2], ([a, b]) => 123); 
n1










//
// when we build, we capture a memoisable graph  
// the passing of an A happens up front here - multiple calls will get exactly the same result
// memoisation requires this immutability
// if we were to offer different As each time, then how would we memoise?
// we could only memoise by escaping real memoisation by memoising functions instead of values
// but we do want to memoise!
// this is what supports the lattice
// unchanging upstreams
// and to concretise as so, we need the root value up front

// so we build, then we summon
//
//

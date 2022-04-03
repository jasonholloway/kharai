import { Merge } from "./util";

let nextNodeId = 1;

export class FacNode<A, B> {

  private readonly nodeId = nextNodeId++;

  private fac: (a:A, s:Session)=>B;

  constructor(fac: (a:A, s:Session)=>B) {
    this.fac = fac;
  }

  summon(a: A) {
    return this.summonInner(a, new Session());
  }

  private summonInner(a: A, s: Session): B {
    return s.summon(this.nodeId, () => this.fac(a, s));
  }

  static root<T = unknown>(): FacNode<T, T> {
    return new FacNode<T, T>((a) => a)
  }

  static derive<AR extends readonly FacNode<never, unknown>[], C>(uppers: AR, fac: (args: ConcatArgs<AR>)=>C): FacNode<MultiplySeeds<AR>, C> {
    return new FacNode<MultiplySeeds<AR>, C>((a, s) => {
      const args = <ConcatArgs<AR>>uppers.map(u => u.summonInner(a, s));
      return fac(args);
    });
  }
}

class Session {

  private entries: [any][] = []
  
  summon<T>(id: number, fac: ()=>T): T {
    const found = this.entries[id];

    if(found) return found[0];
    else {
      const val = fac();
      this.entries[id] = [val];
      return val;
    }
  }
}

type MultiplySeeds<M> =
    M extends readonly [] ? unknown
  : M extends readonly [FacNode<infer T, unknown>, ...infer R] ? Merge<T, MultiplySeeds<R>>
  : unknown;

type ConcatArgs<R> =
    R extends readonly [] ? readonly []
  : R extends readonly [FacNode<never, infer O>, ...infer T] ? readonly [O, ...ConcatArgs<T>]
  : R extends readonly [unknown] ? readonly []
  // : R extends readonly [infer H, ...infer T]
  //   ? readonly [...ConcatArgs<readonly [H]>, ...ConcatArgs<T>]
  : never

export type IfKnown<A, B = A> = unknown extends A ? never : B



{
  type A = ConcatArgs<[FacNode<never, unknown>]>
  type B = ConcatArgs<[FacNode<never, 123>]>
  type C = ConcatArgs<[FacNode<never, 123>, FacNode<never, 999>]>

  type _ = [A, B, C]
}



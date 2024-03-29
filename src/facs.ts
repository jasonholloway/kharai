let nextNodeId = 1;

export class FacNode<O> {

  private readonly nodeId = nextNodeId++;

  private fac: (x: unknown, s:Session)=>O;

  constructor(fac: (x: unknown, s:Session)=>O) {
    this.fac = fac;
  }

  summon(x: unknown) {
    return this.summonInner(x, new Session());
  }

  private summonInner(x: unknown, s: Session): O {
    return s.summon(this.nodeId, () => this.fac(x, s));
  }

  static root(): FacNode<{}> {
    return new FacNode<{}>(() => ({}))
  }

  static derive<AR extends readonly FacNode<unknown>[], B>(uppers: AR, fac: (args:ConcatArgs<AR>, x:unknown)=>B): FacNode<B> {
    return new FacNode<B>((x, s) => {
      const args = <ConcatArgs<AR>><unknown>uppers.map(u => u.summonInner(x, s));
      return fac(args, x);
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

type ConcatArgs<R> =
    R extends readonly [] ? readonly []
  : R extends readonly [FacNode<infer O>, ...infer T] ? readonly [O, ...ConcatArgs<T>]
  // : R extends readonly [unknown] ? readonly []
  : never

export type IfKnown<A, B = A> = unknown extends A ? never : B



{
  type A = ConcatArgs<[FacNode<unknown>]>
  type B = ConcatArgs<[FacNode<123>]>
  type C = ConcatArgs<[FacNode<123>, FacNode<999>]>

  type _ = [A, B, C]
}



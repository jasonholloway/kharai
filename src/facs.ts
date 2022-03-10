export class FacNode<A, B, C> {

  private source: (a:A)=>B;
  private fac: (b:B)=>C;
  private val: C|undefined;

  constructor(source: (a:A)=>B, derive: (b:B)=>C) {
    this.source = source;
    this.fac = derive;
  }

  derive<D>(fac: (c:C)=>D): FacNode<A, C, D> {
    return new FacNode<A, C, D>(a => this.summon(a), fac);
  }

  summon(a: A): C {
    return this.val || (this.val = this.fac(this.source(a)));
  }

  static root<A>(): FacNode<A, A, A> { return new FacNode<A, A, A>((_) => _, (_) => _) };
}

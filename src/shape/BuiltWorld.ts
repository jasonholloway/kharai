import { List, Map } from "immutable";
import { Fac, Handler, Projector } from "../shapeShared";
import { Data, formPath } from "./common";
import { Registry } from "./Registry";

export class BuiltWorld<N,O> {
  public readonly nodes: N = <N><unknown>{}
  public readonly data: Data<N> = <Data<N>><unknown>undefined;
  
  readonly nodeMap: Map<string, Found>;

  constructor(reg: Registry) {

    //below hack needed so that 'C' node gets prepopulated
    //todo: facs should be built lazily!
    const reg2 = reg
      .update(n => n.summon(['C']));

    const withFacs = reg2.root
      .mapBreadthFirst<Found>(
        {},
        (v, upstreams) => {
          const parentFac = upstreams.last()?.fac ?? <Fac>((x)=>x);

          return <Found>{
            guard: v.guard ? v.guard[0] : undefined, //REALLY THIS SHOULD STILL BE WRAPPED
            handler: v.handler,
            projector: v.projector,
            fac: _combineFacs(List([parentFac]).concat(v.facs))
          };
        }); 

    this.nodeMap = Map(
      withFacs
        .mapDepthFirst<List<[List<string>, Found]>>(
          List(),
          (v, downstreams) =>
            downstreams
              .map((ppl, k) => ppl.map(([pl,v]) => <[List<string>, Found]>[pl.insert(0, k), v]))
              .valueSeq()
              .flatMap(ppl => ppl)
              .toList()
              .push([List(), v]))
          .val
          .map(([pl,v]) => <[string,Found]>[formPath([...pl]), v])
      );

    function _combineFacs(facs: List<Fac>): Fac {
      return facs.reduce(
        (ac, fn) => x => {
          const r1 = ac(x);
          if(typeof r1 !== 'object') throw Error('fac not object!');

          const r2 = fn(r1);
          if(typeof r2 !== 'object') throw Error('fac not object!');

          return { ...r1, ...r2 };
        },
        (x => x));
    }
  }

  read(address: string): Found {
    return this.nodeMap.get(address, {});
  }
}

export type Found = {
  guard?: any,
  handler?: Handler,
  projector?: Projector,
  fac?: Fac
}

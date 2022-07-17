import { List } from "immutable";
import { Fac, Handler } from "../shapeShared";
import { Data, formPath, Nodes, separator } from "./common";
import { Registry } from "./Registry";

export class BuiltWorld<N extends Nodes> {
  public readonly nodes: N = <N><unknown>{}
  public readonly data: Data<N> = <Data<N>><unknown>undefined;
  
  readonly reg: Registry

  constructor(reg?: Registry) {
    this.reg = reg ?? Registry.empty;
  }

  read(address: string): ReadResult {
    const reg = this.reg;
    return _read([], address.split(separator));

    function _read(pl: readonly string[], al: readonly string[]): ReadResult {
      if(al.length) {
        const [aHead, ...aTail] = al;
        return _read([...pl, aHead], aTail);
      }

      const path = formPath(pl);

      return {
        guard: reg.getGuard(path),
        handler: reg.getHandler(path),
        fac: _formFac(List(pl))
      };
    }

    function _formFac(pl: List<string>) : Fac {
      const facs = _findFacs(pl);

      return facs.reduce(
        (ac, [_,fn]) => x => {
          const r = ac(x);
          return { ...r, ...fn(r) };
        },
        (x => x));
    }

    function _findFacs(pl: List<string>): List<readonly [string,Fac]> {
      if(pl.isEmpty()) return reg.getFacs('').map(f => ['',f] as const);

      const l = _findFacs(pl.butLast());

      const p = formPath([...pl])
      const r = reg.getFacs(p).map(f => [p,f] as const);

      return List.of(...l, ...r);
    }
  }
}

export type ReadResult = {
  guard?: any,
  handler?: Handler,
  fac?: Fac
}

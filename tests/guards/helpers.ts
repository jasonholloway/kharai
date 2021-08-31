import { Guard, match, Num, Str } from '../../src/guards/Guard'
import { inspect } from 'util'


const i = (x: any) => inspect(x, { depth: 5 })


export function tryMatch(o: { pattern: any, yes?: any[], no?: any[] }) {

  for (const v of o.yes ?? []) {
    it(`${i(o.pattern)} == ${i(v)}`, () =>
      expect(match(o.pattern, v)).toBeTruthy());
  }

  for (const v of o.no ?? []) {
    it(`${i(o.pattern)} != ${i(v)}`, () =>
      expect(match(o.pattern, v)).toBeFalsy());
  }
}

import { FacNode } from "../src/facs";

describe('facs', () => {

  it('simple', () => {
    const root = FacNode.root();
    const child = FacNode.derive([root] as const, ([a]) => ({ species: a, sound: 'meeow' }));
    const result = child.summon('cat');
    expect(result.sound).toBe('meeow');
    expect(result.species).toBe('cat');
  });

  it('lattice', () => {
    const meet   = FacNode.root();
    const child1 = FacNode.derive([meet] as const, ([b]) => ({ species: b, sound: 'meeow' }));
    const child2 = FacNode.derive([meet] as const, ([b]) => ({ furry: true }));
    const join   = FacNode.derive([child1, child2] as const, u => Object.assign(u[0], u[1]));

    const result1 = child1.summon('cat');
    expect(result1.species).toBe('cat');
    expect(result1.sound).toBe('meeow');

    const result2 = child2.summon('cat');
    expect(result2.furry).toBe(true);

    const result3 = join.summon('cat');
    expect(result3.furry).toBe(true);
    expect(result3.sound).toBe('meeow');
    expect(result3.species).toBe('cat');
  });

  it('memoizes shared nodes', () => {
    let c = 0;
    
    const root   = FacNode.root();
    const meet   = FacNode.derive([root] as const, ([s]) => c++)
    const child1 = FacNode.derive([meet] as const, ([n]) => n);
    const child2 = FacNode.derive([meet] as const, ([n]) => n);
    const join   = FacNode.derive([child1, child2] as const, r => r);

    const result = join.summon('moo');
    expect(result[0]).toBe(0);
    expect(result[1]).toBe(0);
  })

  it('lattice repeated', () => {
    const meet   = FacNode.root();
    const child1 = FacNode.derive([meet] as const, ([b]) => ({ species: b, sound: 'meeow' }));
    const child2 = FacNode.derive([meet] as const, ([b]) => ({ furry: true }));
    const join   = FacNode.derive([child1, child2] as const, u => Object.assign(u[0], u[1]));

    const result1 = child1.summon('cat');
    expect(result1.species).toBe('cat');
    expect(result1.sound).toBe('meeow');

    const result2 = child2.summon('cat');
    expect(result2.furry).toBe(true);

    const result3 = join.summon('cat');
    expect(result3.furry).toBe(true);
    expect(result3.sound).toBe('meeow');
    expect(result3.species).toBe('cat');

    const result1_2 = child1.summon('dog');
    expect(result1_2.species).toBe('dog');
    expect(result1_2.sound).toBe('meeow');

    const result3_2 = join.summon('dog');
    expect(result3_2.furry).toBe(true);
    expect(result3_2.sound).toBe('meeow');
    expect(result3_2.species).toBe('dog');
  });
})


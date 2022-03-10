import { FacNode } from "../src/facs";

describe('facs', () => {

  const root = FacNode.root<string>();

  it('child node', () => {
    const child = root.derive(a => ({ species: a, sound: 'meeow' }));
    const result = child.summon('cat');
    expect(result.sound).toBe('meeow');
    expect(result.species).toBe('cat');
  });

  it('fan out', () => {
    const child1 = root.derive(a => ({ species: a, sound: 'meeow' }));
    const child2 = root.derive(a => ({ species: a, sound: 'shriek' }));

    const result1 = child1.summon('cat');
    expect(result1.sound).toBe('meeow');

    const result2 = child2.summon('cat');
    expect(result2.sound).toBe('shriek');
  });
  
})


import { FacNode } from "../src/facs";

describe('facs', () => {


  it('child node', () => {
    const root = FacNode.root<string>();
    const child = FacNode.derive([root], ([a]) => ({ species: a, sound: 'meeow' }));
    const result = child.summon('cat');
    expect(result.sound).toBe('meeow');
    expect(result.species).toBe('cat');
  });

  it('lattice', () => {
    const meet   = FacNode.root<string>();
    const child1 = FacNode.derive([meet], ([b]) => ({ species: b, sound: 'meeow' }));
    const child2 = FacNode.derive([meet], ([b]) => ({ species: b, furry: true }));
    const join   = FacNode.derive([child1, child2], u => u);

    

    const result1 = child1.build('cat');
    expect(result1.sound).toBe('meeow');

    const result2 = child2.summon('lynx');
    expect(result2.species).toBe('lynx');
    expect(result2.sound).toBe('shriek');
  });

  // if we have joins, how does this come about?
  // each node takes in its upstream
  // but also its predecessor?
  // which in most times will be an empty object
  // this allows extension, but without problematising existing consumers
  //
  // 
  //
  //



  

  // memoisation: gah
  // we have a lattice of upstreams as so often
  // which means: the diamond problem
  //
  // we don't want an upstream to be created repeatedly
  // but then there is only one summoning, and it must be fresh each time
  //
  
})


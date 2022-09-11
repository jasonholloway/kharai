import _Monoid from '../src/_Monoid';
import { Map, Set } from 'immutable';
import { act } from '../src/shape/common';
import { World } from '../src/shape/World';
import { Num } from '../src/guards/Guard'
import { MachineSpace, Signal } from '../src/MachineSpace';
import { FakeLoader } from '../src/FakeStore';
import { RealTimer } from '../src/Timer';
import { Subject } from 'rxjs/internal/Subject';
import { RunSpace } from './RunSpace';

describe('MachineSpace', () => {

  const world =
    (c: number) => World
      .shape({
        baa: act(Num)
      })
      .impl({
        async baa({and}, i) {
          return i < c
            ? and.baa(i+ 1)
            : false;
        }
      });
  
  it('summons', async () => {
    const signal$ = new Subject<Signal>();
    const space = new MachineSpace(world(2).build(), new FakeLoader(Map()), new RunSpace(new RealTimer(signal$), signal$), signal$);

    const m = await space.summon(Set(['A'])).toPromise();

    console.log(m.id)
    
  })

});

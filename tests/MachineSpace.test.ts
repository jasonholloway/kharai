import _Monoid from '../src/_Monoid';
import { Map, Set } from 'immutable';
import { act } from '../src/shape/common';
import { World } from '../src/shape/World';
import { Num } from '../src/guards/Guard'
import { MachineSpace, Signal } from '../src/MachineSpace';
import { FakeLoader } from '../src/FakeStore';
import { RealTimer } from '../src/Timer';
import { Subject } from 'rxjs/internal/Subject';
import { RunSpace } from '../src/RunSpace';
import MonoidData from '../src/MonoidData';
import { Lump } from '../src/AtomSpace';
import { DataMap } from '../src/lib';

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
  
  xit('summons', async () => {
    const signal$ = new Subject<Signal>();
    const lump$ = new Subject<Lump<DataMap>>();

    
    const space = new MachineSpace(world(2).build(), new FakeLoader(Map()), new RunSpace(new MonoidData(), new RealTimer(signal$), signal$, lump$), signal$);

    const ms = space.summon(Set(['A']));

    
  })

});

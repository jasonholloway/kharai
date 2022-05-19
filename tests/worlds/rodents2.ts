import _Monoid from '../../src/_Monoid'
import { delay } from '../../src/util'
import { Any, Many, Num, Str } from '../guards/Guard'
import { shape } from '../shape';
import { $root, data } from '../shapeShared';

const w1 = shape({
  $boot: data([]),
  $end: data(Many(Any)),
  $wait: data([Num, $root] as const),

  rat: {
    wake: data([]),
    squeak: data([Num] as const)
  },

  hamster: {
    wake: data([Num] as const),
    nibble: data([])
  },

  guineaPig: {
    runAbout: data([]),
    gruntAt: data([Str] as const)
  },

  gerbil: {
    spawn: data([Num, Num] as const)
  }
});

const w2 = w1
  .fac('rat', x => x)
  .impl({
    rat: {
      async wake(_, [n]) {
        return ['rat_squeak', [123]];
      },

      async squeak(_, [d]) {
        return ['$end', ['I have squeaked ${d}!']]
      }
    }
  });


// todo: put handlers in secret structure behind schema
// todo: put facnode in secret structure, with only succinct type in schema
// todo: return full type from withContext/withPhase
// todo: magic path lookup could be done once in with('aaa:bbb', () => addition) blocks


const w3 = w2
  .withPhase('hamster:wake', async (_, d) => {
    await delay(100);
    return ['$end', [d]]
  })
  .withPhase('hamster:nibble', async () => {
    return ['$end', []];
  });

const w4 = w3
  .withPhase('guineaPig:runAbout', async (x, _) => {
    const a = await x.attach({ chat(m) { return [m, 'squeak!'] } });
    return (a && ['$end', a]) || ['$end', ['BIG NASTY ERROR']]
  })
  .withPhase('guineaPig:gruntAt', async (x, [id]) => {
    const resp = await x.convene([id], {
      convene([p]) {
        const a = p.chat('grunt!');
        if(a) return a;
        else throw Error('bad response from attendee')
      }
    });
    return ['$end', resp]
  });

const w5 = w4
  .withPhase('gerbil:spawn', async (x, [step, max]) => {
    if(step < max) {
      const appendage = String.fromCharCode('a'.charCodeAt(0) + step);

      if(x.id.length < max) {
        const other = `${x.id}${appendage}`;

        await x.convene([other], {
          convene([p]) {
            p.chat([['gerbil', ['spawn', [0, max]]]])
          }
        })

        return ['spawn', [step + 1, max]]
      }
    }

    return false;
  })

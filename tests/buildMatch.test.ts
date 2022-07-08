import { specify,  } from '../src/buildMatch'
import { space, act } from '../src/shapeShared'

describe('buildMatch', () => {

  const w = specify(root =>
    space({
      hello: act(123 as const),

      cow: space({
        talk: act(['moo', 123] as const),
      }),

      sheep: space({
        recurse: act(['baa', root] as const)
      })
    })
  );

  it('simple match', () => {
    const result = w.readAny(['hello', 123]);
    expect(result.errors).toHaveLength(0);
    expect(result.payload).toBe(123);
    expect(result.isValid).toBeTruthy();
  });

  it('simple fail', () => {
    const result = w.readAny(['hello', -123]);
    expect(result.errors).toHaveLength(1);
    expect(result.isValid).toBeFalsy();
  });

  it('bad path', () => {
    const result = w.readAny(['hullo', 123]);
    expect(result.errors).toHaveLength(1);
    expect(result.isValid).toBeFalsy();
  });

  it('nested match', () => {
    const result = w.readAny(['cow:talk', ['moo', 123]])
    expect(result.errors).toHaveLength(0);
    expect(result.payload).toEqual(['moo', 123]);
    expect(result.isValid).toBeTruthy();
  });

  it('nested fail', () => {
    const result = w.readAny(['cow:talk', ['moo', -123]])
    expect(result.errors).toHaveLength(1);
    expect(result.isValid).toBeFalsy();
  });

  it('recursive match', () => {
    const result = w.readAny(['sheep:recurse', ['baa', ['hello', 123]]])
    expect(result.errors).toHaveLength(0);
    expect(result.payload).toEqual(['baa', ['hello', 123]]);
    expect(result.isValid).toBeTruthy();
  });

  it('recursive fail', () => {
    const result = w.readAny(['sheep:recurse', ['baa', ['hello', -123]]])
    expect(result.errors).toHaveLength(1);
    expect(result.isValid).toBeFalsy();
  });


  it('context accessible from handler', () => {
    w.withContext('cow', x => ({ moo: 'moooo' as const }))
      .withPhase('cow:talk', async (x, d) => {
        x.moo //has to be available on type
        throw 'never';
      });
  });

	it('get context', () => {
    const result = w
      .withContext('cow', x => ({ moo: 'moooo', blah: 1 }))
      .withContext('cow:talk', x => ({ blah: 2 }))
      .readAny(['cow:talk', ['moo', 123]]);

    if(!result.summonContext) throw 'not defined!';
    
    const context = result.summonContext();
    expect(context.blah).toBe(2);
    expect(context.moo).toBe('moooo');
	});



	const w2 = w
		.withPhase('cow:talk', async () => {
			return ['cow:talk', ['moo', 123]];
		});

	it('get phase', async () => {
    const result = w2.readAny(['cow:talk', ['moo', 123]]);

    if(result.handler) {
      const next = await result.handler(null, result.payload);
      expect(next).toEqual(['cow:talk', ['moo', 123]]);
    }
    else {
      throw 'handler is undefined!'
    }
	});
	
})


// -------------------------------------------------------
// inference depth check
// {
//   const a = specify(_ => space({
//     hullo: data(Num)
//   }));

//   const b = a
//     .withPhase('hullo', async () => {
//       await delay(1);
//       return ['hullo', 123];
//     })
//     .withPhase('hullo', async () => {
//       await delay(1);
//       return ['hullo', 123];
//     })
//     .withPhase('hullo', async () => {
//       await delay(1);
//       return ['hullo', 123];
//     })
//     .withPhase('hullo', async () => {
//       await delay(1);
//       return ['hullo', 123];
//     })
//     .withPhase('hullo', async () => {
//       await delay(1);
//       return ['hullo', 123];
//     })
//     .withPhase('hullo', async () => {
//       await delay(1);
//       return ['hullo', 123];
//     })
  
//   b
// }

// {
//   const a = specify(_ => space({
//     hullo: data(Num)
//   }));

//   const b = a
//     .withContext('hullo', () => {
//       return { moo: 123 }
//     })
//     .withContext('hullo', () => {
//       return { moo: 123 }
//     })
//     .withContext('hullo', () => {
//       return { moo: 123 }
//     })
//     .withContext('hullo', () => {
//       return { moo: 123 }
//     })
//     .withContext('hullo', () => {
//       return { moo: 123 }
//     })
//     .withContext('hullo', () => {
//       return { moo: 123 }
//     })
//     .withContext('hullo', () => {
//       return { moo: 123 }
//     })
//     .withContext('hullo', () => {
//       return { moo: 123 }
//     })
  
//   b

// }




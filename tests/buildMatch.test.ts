import { specify, match, space, data } from '../src/buildMatch'
import { Num } from './guards/Guard'

describe('buildMatch', () => {

  const w = specify(root =>
    space({
      hello: data(123 as const),

      cow: space({
        talk: data(['moo', 123] as const),
      }),

      sheep: space({
        recurse: data(['baa', root] as const)
      })
    })
  );

  it('simple match', () => {
    const result = w.read(['hello', 123]);
    expect(result.errors).toHaveLength(0);
    expect(result.payload).toBe(123);
    expect(result.isValid).toBeTruthy();
  });

  it('simple fail', () => {
    const result = w.readAny(['hello', -123]);
    expect(result.errors).toHaveLength(1);
    expect(result.payload).toBe(-123);
    expect(result.isValid).toBeFalsy();
  });

  it('bad path', () => {
    const result = w.readAny(['hullo', 123]);
    expect(result.errors).toHaveLength(1);
    expect(result.payload).toBeUndefined();
    expect(result.isValid).toBeFalsy();
  });

  it('nested match', () => {
    const result = w.readAny(['cow', ['talk', ['moo', 123]]])
    expect(result.errors).toHaveLength(0);
    expect(result.payload).toEqual(['moo', 123]);
    expect(result.isValid).toBeTruthy();
  });

  it('nested fail', () => {
    const result = w.readAny(['cow', ['talk', ['moo', -123]]])
    expect(result.errors).toHaveLength(1);
    expect(result.payload).toEqual(['moo', -123]);
    expect(result.isValid).toBeFalsy();
  });

  it('recursive match', () => {
    const result = w.readAny(['sheep', ['recurse', ['baa', ['hello', 123]]]])
    expect(result.errors).toHaveLength(0);
    expect(result.payload).toEqual(['baa', ['hello', 123]]);
    expect(result.isValid).toBeTruthy();
  });

  it('recursive fail', () => {
    const result = w.readAny(['sheep', ['recurse', ['baa', ['hello', -123]]]])
    expect(result.errors).toHaveLength(1);
    expect(result.payload).toEqual(['baa', ['hello', -123]]);
    expect(result.isValid).toBeFalsy();
  });



	const ww = w
    .withContext('cow:talk', x => ({ blah: 123 }));

  it('context accessible from handler', () => {
    w.withContext('cow', x => ({ moo: 'moooo' }))
      // .withPhase('sheep:recurse', async (x, d) => { throw 1;  })
      .withPhase('cow:talk', async (x, d) => {

        x.moo //has to be available on type
        
        return ['cow:talk', ['moo', 123]];
      });
  });

	it('get context, typeless', () => {
    const result = ww.readAny(['cow:talk', ['moo', 123]]);
    if(!result.summonContext) throw 'not defined!';
    
    const context = result.summonContext();
    expect(context.blah).toBe(123);
	});

	it('get context, typed', () => {
    const result = ww.read(['cow:talk', ['moo', 123]]);
    const context = result.summonContext();
    expect(context.blah).toBe(123);
	});



	const w2 = w
		.withPhase('cow:talk', async () => {
			return ['cow:talk', ['moo', 123]];
		});

	it('get phase', async () => {
    const result = w2.read(['cow:talk', ['moo', 123]]);
		expect(result.handler).not.toBeUndefined();

		const next = await result.handler(null, result.payload);
		expect(next).toBe(['cow:talk', ['moo', 123]]);
	});
	
})

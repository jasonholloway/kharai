import { specify, space, data } from '../../src/specs';

describe('Specs', () => {

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
  });

  it('simple fail', () => {
    const result = w.read(['hello', -123]);
    expect(result.errors).toHaveLength(1);
    expect(result.payload).toBe(-123);
  });

  it('bad path', () => {
    const result = w.read(['hullo', 123]);
    expect(result.errors).toHaveLength(1);
    expect(result.payload).toBeUndefined();
  });

  it('nested match', () => {
    const result = w.read(['cow', ['talk', ['moo', 123]]])
    expect(result.errors).toHaveLength(0);
    expect(result.payload).toEqual(['moo', 123]);
  });

  it('nested fail', () => {
    const result = w.read(['cow', ['talk', ['moo', -123]]])
    expect(result.errors).toHaveLength(1);
    expect(result.payload).toEqual(['moo', -123]);
  });

  it('recursive match', () => {
    const result = w.read(['sheep', ['recurse', ['baa', ['hello', 123]]]])
    expect(result.errors).toHaveLength(0);
    expect(result.payload).toEqual(['baa', ['hello', 123]]);
  });

  it('recursive fail', () => {
    const result = w.read(['sheep', ['recurse', ['baa', ['hello', -123]]]])
    expect(result.errors).toHaveLength(1);
    expect(result.payload).toEqual(['baa', ['hello', -123]]);
  });

});

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

});

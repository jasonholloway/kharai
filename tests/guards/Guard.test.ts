import { describe, expect, it } from '@jest/globals';
import { isString } from 'util'
import { Bool, Guard, Num, Str, Many, Any, And, Or, Dict } from '../../src/guards/Guard'
import { tryMatch as test } from './helpers'

describe('Guards', () => {

  it('can check type at compile-time via \'to\'', () => {
    Guard(Num).to<number>();
    Guard(Num).to<123>();
    Guard([Num]).to<[number]>();
    Guard([Num]).to<[123]>();
    Guard({ n: Num }).to<{ n: number }>();
    Guard({ n: Num }).to<{ n: 123 }>();
    Guard(And(Num,3)).to<3>();
    Guard(And(Num,Any,3)).to<3>();

    Guard(Or(333,33,3)).to<3>();

    Guard(<[...typeof Any[]]><unknown>undefined).to<[]>();
    Guard(<[...typeof Any[]]><unknown>undefined).to<[1, 2, 3]>();
    Guard(<[...typeof Any[], typeof Str]><unknown>undefined).to<[1, 2, 'three']>();
  })

  it('using directly', () => {
    expect(Guard(Str)('boo')).toBeTruthy();
    expect(Guard([Str])(['boo'])).toBeTruthy();
    expect(Guard(['a',Str])(['a','boo'])).toBeTruthy();
    expect(Guard(['a',Str])(['b','boo'])).toBeFalsy();
  })

  it('works via vars', () => {
    const MyStr = Str;
    expect(Guard(MyStr)('blah')).toBeTruthy();
    Guard(MyStr).to<'moo'>();
  })
  
})

describe('match' , () => {

  test({
    pattern: 'plops',
    yes: [
      'plops',
    ],
    no: [
      'slops',
      '',
      /plops/,
      123,
      undefined,
      null,
      false,
      []
    ]
  })

  test({
    pattern: Str,
    yes: [
      'plops',
      ''
    ],
    no: [
      123,
      undefined,
      null,
      false,
      []
    ]
  })

  test({
    pattern: Any,
    yes: [
      'plops',
      123,
      true,
      [],
      {},
      undefined
    ],
    no: [
    ]
  })

  test({
    pattern: 123,
    yes: [
      123
    ],
    no: [
      234,
      '123',
      undefined
    ]
  })

  test({
    pattern: Num,
    yes: [
      123,
      234,
      0,
      -9999999,
      NaN
    ],
    no: [
      '123',
      undefined,
      []
    ]
  })

  test({
    pattern: true,
    yes: [
      true
    ],
    no: [
      false,
      0,
      '123',
      undefined
    ]
  })

  test({
    pattern: Bool,
    yes: [
      true,
      false
    ],
    no: [
      undefined,
      null,
      [],
      'hello',
      0
    ]
  })

  test({
    pattern: {},
    yes: [
      {},
      {moreStuffBecauseWeDontDoExactMatching:true},
      []
    ],
    no: [
      true,
      123,
      null
    ]
  })

  test({
    pattern: undefined,
    yes: [
      undefined
    ],
    no: [
      null,
      false,
      0,
      []
    ]
  })

  test({
    pattern: /hello+/,
    yes: [
      'hello',
      'hellooooooo',
      /hello+/
    ],
    no: [
      'hell no',
      /mooooo/,
      null,
      [],
      0,
      false
    ]
  })
  

  describe('tuples', () => {
    test({
      pattern: [] as const,
      yes: [
        [],
        [] as const
      ],
      no: [
        [123],
        [123] as const,
        null,
        'hello',
        0
      ]
    })

    test({
      pattern: [123] as const,
      yes: [
        [123]
      ]
    })

    test({
      pattern: [true, [true]] as const,
      yes: [
        [true, [true]],
        [true, [true]] as const
      ],
      no: [
        [],
        [true],
        [true, []],
        [true, [123]]
      ]
    })
  })

  describe('tuples', () => {
    test({
      pattern: [] as const,
      yes: [
        [],
        [] as const
      ],
      no: [
        [123],
        [123] as const,
        null,
        'hello',
        0
      ]
    })

    test({
      pattern: [123] as const,
      yes: [
        [123]
      ]
    })

    test({
      pattern: [true, [true]] as const,
      yes: [
        [true, [true]],
        [true, [true]] as const
      ],
      no: [
        [],
        [true],
        [true, []],
        [true, [123]]
      ]
    })

    test({
      pattern: ['moo', Str] as const,
      yes: [
        ['moo', ''],
        ['moo', 'baa'],
      ],
      no: [
        [],
        ['moo']
      ]
    })

    test({
      pattern: [Str, Any] as const,
      yes: [
        ['moo', ''],
        ['moo', 'baa'],
        ['moo']
      ],
      no: [
        [],
      ]
    })
  })

  describe('embedded guards', () => {

    test({
      pattern: [Guard(123)],
      yes: [
        [123]
      ],
      no: [
        [],
        [222],
        123
      ]
    })

    test({
      pattern: [isString],
      yes: [
        ['hello']
      ],
      no: [
        [],
        [undefined],
        [222],
        123
      ]
    })

  })

  describe('maps', () => {

    test({
      pattern: {},
      yes: [
        {},
        { hello: 123 },
      ],
      no: [
        undefined
      ]
    })

    test({
      pattern: { woo: 99 },
      yes: [
        { woo: 99 },
        { woo: 99, blah: 123 }
      ],
      no: [
        {},
        { blah: 99 },
        { woo: 98 },
        undefined
      ]
    })

    test({
      pattern: [{ yo: [1] }],
      yes: [
        [{ yo: [1] }],
        [{ yo: [1], moo: 123 }]
      ],
      no: [
        [{ yo: [2] }],
      ]
    })

  })

  describe('arrays', () => {
    test({
      pattern: Many(1),
      yes: [
        [1],
        [1, 1],
        []
      ],
      no: [
        [2, 2],
        'whoompf',
        true,
        [1, 1, 1, null]
      ]
    })
  })

  describe('dicts', () => {
    test({
      pattern: Dict(Num),
      yes: [
        { moo: 123 },
        { moo: 123, baa: 0 },
        {}
      ],
      no: [
        { moo: 'blah' },
        { [0]: 'blah' },
        123,
        'baa',
        null,
        undefined
      ]
    })
  })

  describe('arrays of special matchers', () => {
    test({
      pattern: Many(Str),
      yes: [
        ['plop'],
        ['plop', 'plop'],
        []
      ],
      no: [
        [2, 2],
        'whoompf',
        true,
        [1, 1, 1, null]
      ]
    })
  })

  describe('nested arrays of special matchers', () => {
    test({
      pattern: Many(Many(Num)),
      yes: [
        [[1], [], [1, 2, 3]],
        [[]],
        []
      ],
      no: [
        [2, 2],
        [[], [1], [true]],
        [[[]]]
      ]
    })
  })

  describe('ands', () => {
    test({
      pattern: And(Any,Any),
      yes: [
        1, 'blah', {}
      ],
      no: []
    })

    test({
      pattern: And(Any,Num),
      yes: [
        1, 2, 3, 4
      ],
      no: [
        {}, ''
      ]
    })

    test({
      pattern: And(Any,Num,13),
      yes: [
        13
      ],
      no: [
        4, {}
      ]
    })

    test({
      pattern: And(Num,1),
      yes: [1],
      no: [2]
    })
  })

  describe('ors', () => {
    test({
      pattern: Or(Any,Any),
      yes: [
        1, 'blah', {}
      ],
      no: []
    })

    test({
      pattern: Or({},Num),
      yes: [
        1, 100, {}
      ],
      no: ['']
    })

    test({
      pattern: Or(Num,1),
      yes: [1,2,3,4],
      no: ['']
    })

    test({
      pattern: Or({},123,Str),
      yes: [
        123, {}, 'hello'
      ],
      no: [true, 7, null]
    })
  })

  //skipped as recursive reading needed instead of standard type maps
  //sidestepping for now
  // xdescribe('arrays containing Bottom', () => {
  //   test({
  //     pattern: [123, Bottom],
  //     no: [
  //       [],
  //       [1, 1],
  //       [123],
  //       [123, 1]
  //     ]
  //   })
  // })

})

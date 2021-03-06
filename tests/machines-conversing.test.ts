import _Monoid from '../src/_Monoid'
import { scenario } from './shared'
import { parakeet } from './worlds/parakeet'
import { delay } from '../src/util';

describe('machines - conversing', () => {
	const fac = scenario(parakeet);

	it('atom dependencies tracked', async () => {
		const x = fac({ save: false });

		await Promise.all([
			x.run.boot('Polly', ['listen', []]),
			x.run.boot('Priscilla', ['listen', []]),
			x.run.boot('Pete', ['chirp', [['Polly', 'Priscilla'], 'hello!']])
		]);

		await delay(200)

		const polly = x.view('Polly');
		const priscilla = x.view('Priscilla');
		const pete = x.view('Pete');

		expect(priscilla[0].val().toObject())
			.toEqual({ Priscilla: ['listen', []] })

		expect(priscilla[1].val().toObject())
			.toEqual({
				Polly: ['$end', ['chirped!']],
				Priscilla: ['chirp', [[], 'hello!']]
			})

		expect(priscilla[1].parents())
			.toContainEqual(priscilla[0])

		expect(priscilla[1].parents())
			.toContainEqual(polly[1])

		expect(priscilla[2].val().toObject())
			.toEqual({
				Priscilla: ['$end', ['no-one to chirp to!']]
			})

		expect(priscilla[2].parents())
			.toContainEqual(priscilla[1])
	})
})


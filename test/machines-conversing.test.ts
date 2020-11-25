import _Monoid from '../src/_Monoid'
import { scenario, getAtoms } from './shared'
import { parakeet } from './worlds/parakeet'

describe('machines - conversing', () => {
	const fac = scenario(parakeet);

	it('atom dependencies tracked', async () => {
		const x = fac();

		const [polly, priscilla, pete] = await Promise.all([
			x.atoms('Polly'),
			x.atoms('Priscilla'),
			x.atoms('Pete'),
			x.run.boot('Polly', ['listen', []]),
			x.run.boot('Priscilla', ['listen', []]),
			x.run.boot('Pete', ['chirp', [['Polly', 'Priscilla'], 'hello!']])
		]);

		expect(priscilla[0].val.toObject())
			.toEqual({ Priscilla: ['listen', []] })

		expect(priscilla[1].val.toObject())
			.toEqual({
				Polly: ['$end', ['chirped!']],
				Priscilla: ['chirp', [[], 'hello!']]
			})

		expect(getAtoms(priscilla[1].parents))
			.toContain(priscilla[0])

		expect(getAtoms(priscilla[1].parents))
			.toContain(polly[1])

		expect(priscilla[2].val.toObject())
			.toEqual({
				Priscilla: ['$end', ['no-one to chirp to!']]
			})

		expect(getAtoms(priscilla[2].parents))
			.toContain(priscilla[1])
	})
})


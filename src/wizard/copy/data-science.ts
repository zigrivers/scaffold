import type { DataScienceCopy } from './types.js'

export const dataScienceCopy: DataScienceCopy = {
  audience: {
    short: 'Scale and context of the data-science work.',
    long:
      'Solo / small team means local-first, reproducibility-first, notebook-to-pipeline work '
      + 'without existing company infrastructure. (Platform-scale data science will be added '
      + 'in a future release.)',
    options: {
      solo: {
        label: 'Solo / small team',
        short: 'Analytics or modeling done locally, without existing platform infra.',
      },
    },
  },
}

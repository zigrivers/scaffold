import type { Web3Copy } from './types.js'

export const web3Copy: Web3Copy = {
  scope: {
    short: 'Scope and shape of the web3 work.',
    long:
      'Smart-contract / protocol projects ship Solidity to EVM chains (Foundry or '
      + 'Hardhat, with Slither / Echidna audit workflows). Web3 application / dApp '
      + 'support will be added in a future release.',
    options: {
      contracts: {
        label: 'Smart contracts / protocol',
        short: 'Solidity on EVM chains — Foundry / Hardhat with audit discipline.',
      },
    },
  },
}

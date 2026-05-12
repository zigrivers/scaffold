#!/usr/bin/env bats
# tests/evals/web3-overlay-content.bats
#
# Keyword-presence spot checks for web3 knowledge docs. Guards against
# a future edit hollowing out a document. NOT a substitute for human review.

PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
KB_DIR="${PROJECT_ROOT}/content/knowledge/web3"

@test "web3-requirements mentions invariants" {
  grep -q 'invariants' "${KB_DIR}/web3-requirements.md"
}

@test "web3-conventions mentions forge fmt" {
  grep -q 'forge fmt' "${KB_DIR}/web3-conventions.md"
}

@test "web3-project-structure mentions foundry.toml" {
  grep -q 'foundry.toml' "${KB_DIR}/web3-project-structure.md"
}

@test "web3-dev-environment mentions Foundry" {
  grep -q 'Foundry' "${KB_DIR}/web3-dev-environment.md"
}

@test "web3-security mentions reentrancy" {
  grep -q 'reentrancy' "${KB_DIR}/web3-security.md"
}

@test "web3-testing mentions forge" {
  grep -q 'forge' "${KB_DIR}/web3-testing.md"
}

@test "web3-architecture mentions OpenZeppelin" {
  grep -q 'OpenZeppelin' "${KB_DIR}/web3-architecture.md"
}

@test "web3-access-control mentions Safe" {
  grep -q 'Safe' "${KB_DIR}/web3-access-control.md"
}

@test "web3-upgradeability mentions UUPS" {
  grep -q 'UUPS' "${KB_DIR}/web3-upgradeability.md"
}

@test "web3-gas-optimization mentions unchecked" {
  grep -q 'unchecked' "${KB_DIR}/web3-gas-optimization.md"
}

@test "web3-oracles-and-external-data mentions Chainlink" {
  grep -q 'Chainlink' "${KB_DIR}/web3-oracles-and-external-data.md"
}

@test "web3-audit-workflow mentions Slither" {
  grep -q 'Slither' "${KB_DIR}/web3-audit-workflow.md"
}

@test "web3-common-vulnerabilities mentions EIP-712" {
  grep -q 'EIP-712' "${KB_DIR}/web3-common-vulnerabilities.md"
}

@test "web3-deployment-and-verification mentions Etherscan" {
  grep -q 'Etherscan' "${KB_DIR}/web3-deployment-and-verification.md"
}

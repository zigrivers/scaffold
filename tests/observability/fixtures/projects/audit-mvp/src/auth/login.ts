import { uniq } from 'lodash'  // unsanctioned — Lens D fires; Lens G correlates → P0

export function login(email: string, password: string): boolean {
  console.log('login attempt', email)  // Lens C fires
  return uniq([email, password]).length === 2
}

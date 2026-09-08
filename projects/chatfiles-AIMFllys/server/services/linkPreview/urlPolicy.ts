import { lookup } from 'node:dns/promises'
import net from 'node:net'

export type HostResolver = (hostname: string) => Promise<string[]>

async function defaultResolver(hostname: string) {
  return (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address)
}

function publicIpv4(address: string) {
  const parts = address.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  const [a, b] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 0 || b === 168)) return false
  if (a === 192 && b === 0 && parts[2] === 2) return false
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && parts[2] === 100))) return false
  if (a === 203 && b === 0 && parts[2] === 113) return false
  return true
}

function publicIpv6(value: string) {
  const address = value.toLowerCase().split('%')[0]
  if (address === '::' || address === '::1') return false
  if (address.startsWith('::ffff:')) return publicIpv4(address.slice(7))
  if (/^(?:fc|fd)/u.test(address)) return false
  if (/^fe[89ab]/u.test(address)) return false
  if (address.startsWith('ff') || address.startsWith('2001:db8')) return false
  return true
}

export function isPublicAddress(address: string) {
  const version = net.isIP(address)
  return version === 4 ? publicIpv4(address) : version === 6 ? publicIpv6(address) : false
}

function blockedHostname(hostname: string) {
  const value = hostname.toLowerCase().replace(/^\[|\]$/gu, '')
  return value === 'localhost'
    || value.endsWith('.localhost')
    || value.endsWith('.local')
    || value.endsWith('.internal')
    || value.endsWith('.lan')
}

export async function validatePublicUrl(value: string, resolveHost: HostResolver = defaultResolver) {
  if (!value || value.length > 4096) return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null
    const hostname = url.hostname.replace(/^\[|\]$/gu, '')
    if (!hostname || blockedHostname(hostname)) return null
    if (net.isIP(hostname)) return isPublicAddress(hostname) ? url : null
    const addresses = await resolveHost(hostname)
    if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) return null
    return url
  } catch {
    return null
  }
}

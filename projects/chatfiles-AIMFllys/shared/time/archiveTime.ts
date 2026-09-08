export const DEFAULT_ARCHIVE_TIME_ZONE = 'Asia/Shanghai'

function assertIanaTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(0)
  } catch {
    throw new Error('CHATFILES_TIME_ZONE must be a valid IANA time zone')
  }
  if (!value.includes('/') && value !== 'UTC') {
    throw new Error('CHATFILES_TIME_ZONE must be a valid IANA time zone')
  }
}

export function resolveArchiveTimeZone(configured: string | undefined) {
  const timeZone = configured?.trim() || DEFAULT_ARCHIVE_TIME_ZONE
  assertIanaTimeZone(timeZone)
  return timeZone
}

function timestampParts(epochSeconds: number, timeZone: string) {
  if (!Number.isSafeInteger(epochSeconds) || epochSeconds < 0) {
    throw new RangeError('epoch seconds must be a non-negative safe integer')
  }
  assertIanaTimeZone(timeZone)
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone,
    timeZoneName: 'longOffset',
    year: 'numeric',
  })
  return new Map(formatter.formatToParts(new Date(epochSeconds * 1_000)).map((part) => [part.type, part.value]))
}

export function archiveDay(epochSeconds: number, timeZone: string) {
  const parts = timestampParts(epochSeconds, timeZone)
  return `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`
}

export function formatArchiveTimestamp(epochSeconds: number, timeZone: string) {
  const parts = timestampParts(epochSeconds, timeZone)
  const date = `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`
  const time = `${parts.get('hour')}:${parts.get('minute')}:${parts.get('second')}`
  const zone = (parts.get('timeZoneName') ?? 'GMT+00:00').replace(/^GMT/u, '') || '+00:00'
  return `${date} ${time} ${zone}`
}

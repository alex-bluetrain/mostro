import { formatYearMonth } from '@lib/date-scope'

export function getRefundsRunId(year: number, month: number) {
    return `refunds-${formatYearMonth(year, month)}`
}

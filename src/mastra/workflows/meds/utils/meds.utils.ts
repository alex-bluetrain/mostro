import { formatYearMonth } from '@lib/date-scope'

export function getMedsRunId(year: number, month: number) {
    return `meds-${formatYearMonth(year, month)}`
}

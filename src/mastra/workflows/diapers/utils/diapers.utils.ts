import { formatYearMonth } from '@lib/date-scope'

export function getDiapersRunId(year: number, month: number) {
    return `diapers-${formatYearMonth(year, month)}`
}

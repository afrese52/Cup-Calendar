import type { SearchConsoleReportItem } from '@workspace/api-client-react';

export type SearchConsoleCsvPeriods = {
  startDate: string;
  endDate: string;
  comparisonStartDate: string;
  comparisonEndDate: string;
};

const CSV_HEADERS = ['Seite', 'Zeitraum', 'Suchbegriff', 'Klicks', 'Impressionen', 'Position'];
const HIDDEN_QUERIES_NOTICE =
  'Google blendet seltene oder anonymisierte Suchanfragen möglicherweise aus. Die Liste kann unvollständig sein.';

function protectSpreadsheetFormula(value: string) {
  return /^[\s\u0000-\u001f]*[=+\-@]/.test(value) ? `'${value}` : value;
}

function quoteCsvCell(value: string | number | null) {
  const text = value == null ? '' : String(value);
  const safeText = typeof value === 'string' ? protectSpreadsheetFormula(text) : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function csvRow(values: Array<string | number | null>) {
  return values.map(quoteCsvCell).join(';');
}

export function buildSearchConsoleCsv(
  items: SearchConsoleReportItem[],
  periods: SearchConsoleCsvPeriods,
) {
  const rows = [csvRow(CSV_HEADERS)];
  const reportPeriods = [
    {
      label: 'Aktuell',
      startDate: periods.startDate,
      endDate: periods.endDate,
      clicks: 'currentClicks',
      impressions: 'currentImpressions',
      position: 'currentPosition',
    },
    {
      label: 'Vergleich',
      startDate: periods.comparisonStartDate,
      endDate: periods.comparisonEndDate,
      clicks: 'comparisonClicks',
      impressions: 'comparisonImpressions',
      position: 'comparisonPosition',
    },
  ] as const;

  for (const item of items) {
    for (const period of reportPeriods) {
      const periodLabel = `${period.label}: ${period.startDate} bis ${period.endDate}`;
      const visibleQueries = item.queryComparisons.filter(
        (query) => query[period.clicks] !== null
          || query[period.impressions] !== null
          || query[period.position] !== null,
      );

      if (visibleQueries.length === 0) {
        rows.push(csvRow([
          item.url,
          periodLabel,
          'Keine sichtbaren Suchbegriffe für diesen Zeitraum gemeldet',
          null,
          null,
          null,
        ]));
        continue;
      }

      for (const query of visibleQueries) {
        rows.push(csvRow([
          item.url,
          periodLabel,
          query.query,
          query[period.clicks],
          query[period.impressions],
          query[period.position],
        ]));
      }
    }

    rows.push(csvRow([item.url, '', 'Hinweis', '', '', HIDDEN_QUERIES_NOTICE]));
  }

  return `\uFEFF${rows.join('\r\n')}\r\n`;
}

import { File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SearchConsoleReportItem } from '@workspace/api-client-react';
import { buildSearchConsoleCsv, type SearchConsoleCsvPeriods } from './search-console-csv';

export async function shareSearchConsoleCsv(
  items: SearchConsoleReportItem[],
  periods: SearchConsoleCsvPeriods,
) {
  const csv = buildSearchConsoleCsv(items, periods);
  const filename = `cupcal-suchbegriffe-${periods.startDate}-${periods.endDate}.csv`;
  const file = new ExpoFile(Paths.cache, filename);
  file.create({ overwrite: true });
  await file.write(csv);
  await Sharing.shareAsync(file.uri, {
    dialogTitle: 'CupCal-Suchbegriffe exportieren',
    mimeType: 'text/csv',
    UTI: 'public.comma-separated-values-text',
  });

  return { uri: file.uri };
}

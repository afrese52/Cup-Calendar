export interface MhtImportSkippedCounts {
  skippedWarningCount: number;
  skippedPastCount: number;
  skippedInvalidCount: number;
  skippedCount: number;
}

export function getMhtImportSkippedCounts(input: {
  warningCount: number;
  skippedPastCount: number;
  invalidCount: number;
}): MhtImportSkippedCounts {
  return {
    skippedWarningCount: input.warningCount,
    skippedPastCount: input.skippedPastCount,
    skippedInvalidCount: input.invalidCount,
    skippedCount: input.warningCount + input.skippedPastCount + input.invalidCount,
  };
}

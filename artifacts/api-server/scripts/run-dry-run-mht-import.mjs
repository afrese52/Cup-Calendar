import {
  parseArguments,
  printUsage,
  runDryRun,
} from "./dry-run-mht-import.mjs";

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }
  const result = await runDryRun(options);
  if (result.invalidCount > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Trockenlauf fehlgeschlagen.");
  printUsage();
  process.exitCode = 1;
});

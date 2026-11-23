import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const report = JSON.parse(readFileSync(resolve("coverage/coverage-summary.json"), "utf8"));
const percent = ({ pct }) => `${pct.toFixed(2)}%`;
const metrics = ["lines", "statements", "functions", "branches"];
const labels = {
  lines: "Строки",
  statements: "Инструкции",
  functions: "Функции",
  branches: "Ветки",
};

const modulePath = Object.keys(report).find((path) =>
  path.endsWith("src/features/balances/domain/CustomerBalance.ts"),
);
const moduleCoverage = modulePath ? report[modulePath] : null;

const lines = [
  "## Покрытие тестами",
  "",
  "| Метрика | Всего | Покрыто | % |",
  "| --- | ---: | ---: | ---: |",
  ...metrics.map(
    (metric) =>
      `| ${labels[metric]} | ${report.total[metric].total} | ${report.total[metric].covered} | ${percent(report.total[metric])} |`,
  ),
  "",
];

if (moduleCoverage) {
  lines.push(
    "### Баланс заказчика",
    "",
    ...metrics.map((metric) => `- ${labels[metric]}: ${percent(moduleCoverage[metric])}`),
    "",
  );
}

lines.push("Полный HTML-отчёт — в артефакте `coverage`.", "");

const markdown = lines.join("\n");
const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  appendFileSync(summaryFile, `${markdown}\n`);
} else {
  process.stdout.write(markdown);
}

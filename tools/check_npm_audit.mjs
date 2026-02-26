#!/usr/bin/env node

import fs from "node:fs";

function loadJson(path) {
  const raw = fs.readFileSync(path, "utf-8");
  return JSON.parse(raw);
}

function counts(report) {
  const meta = report?.metadata?.vulnerabilities ?? {};
  return {
    info: Number(meta.info ?? 0),
    low: Number(meta.low ?? 0),
    moderate: Number(meta.moderate ?? 0),
    high: Number(meta.high ?? 0),
    critical: Number(meta.critical ?? 0),
    total: Number(meta.total ?? 0),
  };
}

function formatCounts(label, c) {
  return `- ${label}: total=${c.total}, critical=${c.critical}, high=${c.high}, moderate=${c.moderate}, low=${c.low}, info=${c.info}`;
}

const [currentPath, baselinePath] = process.argv.slice(2);
if (!currentPath) {
  console.error(
    "Usage: node tools/check_npm_audit.mjs <current.json> [baseline.json]",
  );
  process.exit(2);
}

const current = counts(loadJson(currentPath));
const hasBaseline = baselinePath && fs.existsSync(baselinePath);
const baseline = hasBaseline ? counts(loadJson(baselinePath)) : null;

const lines = [];
lines.push("## npm audit summary");
lines.push(formatCounts("Current", current));
if (baseline) {
  lines.push(formatCounts("Baseline", baseline));
  lines.push(
    `- Delta: total=${current.total - baseline.total}, critical=${current.critical - baseline.critical}, high=${current.high - baseline.high}, moderate=${current.moderate - baseline.moderate}`,
  );
} else {
  lines.push("- Baseline: not found");
}

const criticalHigh = current.critical + current.high;
if (criticalHigh > 0) {
  lines.push("- Status: FAIL (high/critical vulnerabilities detected)");
  console.log(lines.join("\n"));
  process.exit(1);
}

lines.push("- Status: PASS (high/critical vulnerabilities are zero)");
console.log(lines.join("\n"));

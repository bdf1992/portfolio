'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const policy = JSON.parse(fs.readFileSync(path.join(root, 'verification-policy.json'), 'utf8'));
const testFile = 'test/workflow-model.test.cjs';
const source = fs.readFileSync(path.join(root, testFile), 'utf8');
const declared = (source.match(/^test\(/gm) || []).length;
if (declared > policy.maximumCollectedCases || declared === 0) throw new Error('Collected test count is outside policy');
const args = ['--test', '--experimental-test-coverage', '--test-timeout=15000', '--test-reporter=tap',
  '--test-coverage-include=**/workflow-model.js', `--test-coverage-lines=${policy.minimumExecutableLineCoverage}`, testFile];
const started = Date.now();
const result = spawnSync(process.execPath, args, { cwd: root, timeout: policy.maximumRunnerMilliseconds, encoding: 'utf8', maxBuffer: 2000000 });
const elapsed = Date.now()-started;
const output = (result.stdout || '') + (result.stderr || '');
const count = Number(output.match(/# tests (\d+)/)?.[1] || 0);
const coverageLines = output.split('\n').filter(line => /workflow-model\.js|all files/i.test(line));
const digest = file => crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const record = { policyVersion:policy.version, profile:policy.profile, at:new Date().toISOString(),
  node:process.version, platform:process.platform, architecture:process.arch, dependencyIdentity:'Node built-in test runner; no third-party test dependencies',
  command:[process.execPath,...args], sourceIdentity:policy.productionSourceScope.map(file=>({file,sha256:digest(file)})),
  testIdentity:{file:testFile,sha256:digest(testFile)}, collectedCases:declared, actualCases:count,
  coverageScope:policy.productionSourceScope, coverageReport:coverageLines, elapsedMilliseconds:elapsed,
  status:result.status, error:result.error?.message || null,
  passed:result.status===0 && count===declared && count<=policy.maximumCollectedCases && elapsed<=policy.maximumRunnerMilliseconds };
fs.mkdirSync(path.join(root,policy.evidenceDirectory),{recursive:true});
fs.writeFileSync(path.join(root,policy.evidenceDirectory,'model-output.tap'),output);
fs.writeFileSync(path.join(root,policy.evidenceDirectory,'model-check.json'),JSON.stringify(record,null,2));
process.stdout.write(output);
console.log(`Budget: ${count}/${policy.maximumCollectedCases} cases; ${elapsed}/${policy.maximumRunnerMilliseconds} ms.`);
process.exitCode=record.passed?0:1;

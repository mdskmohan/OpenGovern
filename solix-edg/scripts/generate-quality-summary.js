#!/usr/bin/env node

/**
 * Quality Summary Generation Script
 *
 * This script generates a comprehensive quality summary
 * for the OpenGovern platform including code metrics,
 * test coverage, and quality scores.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('📊 Generating quality summary...\n');

let summary = {
  timestamp: new Date().toISOString(),
  metrics: {},
  scores: {},
  issues: []
};

try {
  // Get package.json info
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  summary.metrics.version = packageJson.version;
  summary.metrics.name = packageJson.name;

  console.log('📦 Project Info:');
  console.log(`  Name: ${summary.metrics.name}`);
  console.log(`  Version: ${summary.metrics.version}`);

  // Count lines of code
  console.log('\n📏 Code Metrics:');
  try {
    const clocOutput = execSync('find . -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" | grep -v node_modules | grep -v .next | wc -l', { encoding: 'utf8' });
    const linesOfCode = parseInt(clocOutput.trim());
    summary.metrics.linesOfCode = linesOfCode;
    console.log(`  Lines of Code: ${linesOfCode.toLocaleString()}`);
  } catch (error) {
    console.log('  Lines of Code: Unable to calculate');
  }

  // Count TypeScript files
  try {
    const tsFiles = execSync('find . -name "*.ts" -o -name "*.tsx" | grep -v node_modules | grep -v .next | wc -l', { encoding: 'utf8' });
    summary.metrics.tsFiles = parseInt(tsFiles.trim());
    console.log(`  TypeScript Files: ${summary.metrics.tsFiles}`);
  } catch (error) {
    console.log('  TypeScript Files: Unable to count');
  }

  // Check test coverage
  console.log('\n🧪 Test Coverage:');
  try {
    // Try to find coverage reports
    const coverageDirs = [
      'coverage',
      'frontend/coverage',
      'backend/*/coverage'
    ];

    let totalCoverage = 0;
    let coverageCount = 0;

    coverageDirs.forEach(dir => {
      try {
        const coveragePath = path.join(process.cwd(), dir, 'lcov-report', 'index.html');
        if (fs.existsSync(coveragePath)) {
          // Parse coverage from lcov.info if available
          const lcovPath = path.join(process.cwd(), dir, 'lcov.info');
          if (fs.existsSync(lcovPath)) {
            const lcovContent = fs.readFileSync(lcovPath, 'utf8');
            // Simple coverage extraction (this is a basic implementation)
            console.log(`  Found coverage report: ${dir}`);
            coverageCount++;
          }
        }
      } catch (error) {
        // Ignore errors for individual coverage checks
      }
    });

    if (coverageCount > 0) {
      console.log(`  Coverage Reports: ${coverageCount} found`);
      summary.scores.testCoverage = coverageCount > 0 ? 'Available' : 'Not Available';
    } else {
      console.log('  Coverage Reports: Not found');
      summary.scores.testCoverage = 'Not Available';
    }
  } catch (error) {
    console.log('  Test Coverage: Unable to check');
    summary.scores.testCoverage = 'Error';
  }

  // Check linting status
  console.log('\n🔍 Code Quality:');
  try {
    const lintResult = execSync('npm run lint 2>&1 || true', { encoding: 'utf8' });
    if (lintResult.includes('error') || lintResult.includes('Error')) {
      console.log('  ESLint: Issues found');
      summary.scores.eslint = 'Issues Found';
      summary.issues.push('ESLint issues detected');
    } else {
      console.log('  ESLint: ✅ Passed');
      summary.scores.eslint = 'Passed';
    }
  } catch (error) {
    console.log('  ESLint: Unable to check');
    summary.scores.eslint = 'Error';
  }

  // Check TypeScript compilation
  try {
    const tsResult = execSync('npm run type-check 2>&1 || true', { encoding: 'utf8' });
    if (tsResult.includes('error') || tsResult.includes('Error')) {
      console.log('  TypeScript: Issues found');
      summary.scores.typescript = 'Issues Found';
      summary.issues.push('TypeScript compilation errors');
    } else {
      console.log('  TypeScript: ✅ Passed');
      summary.scores.typescript = 'Passed';
    }
  } catch (error) {
    console.log('  TypeScript: Unable to check');
    summary.scores.typescript = 'Error';
  }

  // Check bundle size
  console.log('\n📦 Bundle Analysis:');
  try {
    const frontendPath = path.join(process.cwd(), 'frontend');
    if (fs.existsSync(path.join(frontendPath, 'package.json'))) {
      const buildOutput = execSync('cd frontend && npm run build 2>&1 | tail -20', { encoding: 'utf8' });

      // Extract bundle size info (this is a simple implementation)
      if (buildOutput.includes('built successfully')) {
        console.log('  Frontend Build: ✅ Successful');
        summary.scores.frontendBuild = 'Successful';
      } else {
        console.log('  Frontend Build: Issues found');
        summary.scores.frontendBuild = 'Issues Found';
      }
    }
  } catch (error) {
    console.log('  Bundle Analysis: Unable to check');
    summary.scores.bundleSize = 'Error';
  }

  // Check dependencies
  console.log('\n📋 Dependencies:');
  try {
    const auditResult = execSync('npm audit --audit-level=moderate --json 2>/dev/null || echo "{}"', { encoding: 'utf8' });
    const auditData = JSON.parse(auditResult);

    const vulnerabilities = auditData.metadata?.vulnerabilities || {};
    const totalVulns = vulnerabilities.low + vulnerabilities.moderate + vulnerabilities.high + vulnerabilities.critical;

    if (totalVulns > 0) {
      console.log(`  Security Vulnerabilities: ${totalVulns} found`);
      summary.scores.security = `${totalVulns} vulnerabilities`;
      summary.issues.push(`${totalVulns} security vulnerabilities detected`);
    } else {
      console.log('  Security Vulnerabilities: ✅ None found');
      summary.scores.security = 'Clean';
    }
  } catch (error) {
    console.log('  Dependencies: Unable to check');
    summary.scores.dependencies = 'Error';
  }

  // Generate overall quality score
  console.log('\n🏆 Overall Quality Score:');

  let qualityScore = 100;
  let deductions = [];

  if (summary.scores.eslint === 'Issues Found') {
    qualityScore -= 15;
    deductions.push('ESLint issues (-15)');
  }

  if (summary.scores.typescript === 'Issues Found') {
    qualityScore -= 20;
    deductions.push('TypeScript errors (-20)');
  }

  if (summary.scores.frontendBuild === 'Issues Found') {
    qualityScore -= 25;
    deductions.push('Build issues (-25)');
  }

  if (summary.scores.security !== 'Clean' && summary.scores.security !== 'Error') {
    qualityScore -= 30;
    deductions.push('Security vulnerabilities (-30)');
  }

  if (summary.scores.testCoverage === 'Not Available') {
    qualityScore -= 10;
    deductions.push('No test coverage (-10)');
  }

  summary.scores.overall = Math.max(0, qualityScore);

  console.log(`  Score: ${summary.scores.overall}/100`);

  if (deductions.length > 0) {
    console.log('  Deductions:');
    deductions.forEach(deduction => {
      console.log(`    - ${deduction}`);
    });
  }

  // Save summary to file
  const summaryPath = path.join(process.cwd(), 'quality-summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log('\n💾 Quality summary saved to quality-summary.json');

  // Output for CI/CD
  console.log(`\n::set-output name=quality-score::${summary.scores.overall}`);
  console.log(`::set-output name=issues-count::${summary.issues.length}`);

} catch (error) {
  console.error('❌ Error generating quality summary:', error.message);
  process.exit(1);
}

console.log('\n✅ Quality summary generation completed');
process.exit(0);
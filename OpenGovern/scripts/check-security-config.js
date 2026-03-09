#!/usr/bin/env node

/**
 * Security Configuration Check Script
 *
 * This script validates security configurations and best practices
 * for the OpenGovern platform deployment.
 */

const fs = require('fs');
const path = require('path');

console.log('🔒 Checking security configuration...\n');

// Check for security-related files
const securityFiles = [
  '.env.example',
  'infrastructure/docker/docker-compose.yml'
];

console.log('📁 Checking security files:');
securityFiles.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    process.exit(1);
  }
});

console.log('\n🔐 Checking environment variable security:');

// Check .env.example for sensitive variables
const envExamplePath = path.join(process.cwd(), '.env.example');
const envContent = fs.readFileSync(envExamplePath, 'utf8');

const sensitiveVars = [
  'JWT_SECRET',
  'DATABASE_URL',
  'REDIS_URL',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'OPENMETADATA_API_KEY',
  'SLACK_WEBHOOK_URL'
];

let securityIssues = [];

sensitiveVars.forEach(varName => {
  if (envContent.includes(varName)) {
    // Check if variable has a placeholder value (not actual secrets)
    const lines = envContent.split('\n');
    const varLine = lines.find(line => line.includes(varName));

    if (varLine && (varLine.includes('your_') || varLine.includes('CHANGE_ME') ||
                   varLine.includes('example') || varLine.includes('placeholder'))) {
      console.log(`  ✅ ${varName} - properly configured with placeholder`);
    } else {
      console.log(`  ⚠️  ${varName} - check if this contains real secrets`);
      securityIssues.push(`${varName} may contain real secrets`);
    }
  } else {
    console.log(`  ❌ ${varName} - MISSING from .env.example`);
    securityIssues.push(`${varName} missing from environment configuration`);
  }
});

console.log('\n🐳 Checking Docker security:');

// Check Dockerfile for security best practices
const dockerfilePath = path.join(process.cwd(), 'infrastructure/docker/Dockerfile');
if (fs.existsSync(dockerfilePath)) {
  const dockerContent = fs.readFileSync(dockerfilePath, 'utf8');

  // Check for non-root user
  if (dockerContent.includes('USER') && !dockerContent.includes('USER root')) {
    console.log('  ✅ Dockerfile uses non-root user');
  } else {
    console.log('  ⚠️  Dockerfile may be running as root');
    securityIssues.push('Dockerfile should use non-root user');
  }

  // Check for latest base image tag (avoid :latest)
  if (dockerContent.includes('FROM') && dockerContent.includes(':latest')) {
    console.log('  ⚠️  Dockerfile uses :latest tag - consider pinning versions');
    securityIssues.push('Dockerfile uses :latest tag instead of pinned versions');
  } else {
    console.log('  ✅ Dockerfile uses pinned base image versions');
  }
}

console.log('\n🔥 Checking package.json security:');

// Check package.json for security issues
const packageJsonPath = path.join(process.cwd(), 'package.json');
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  // Check for scripts that might be dangerous
  const scripts = packageJson.scripts || {};
  const dangerousScripts = ['preinstall', 'postinstall'];

  dangerousScripts.forEach(script => {
    if (scripts[script]) {
      console.log(`  ⚠️  ${script} script found - review for security`);
      securityIssues.push(`${script} script may pose security risk`);
    }
  });

  console.log('  ✅ package.json security check completed');
}

console.log('\n📋 Checking for security documentation:');

// Check for security-related documentation
const securityDocs = [
  'SECURITY.md',
  'docs/security.md'
];

let hasSecurityDocs = false;
securityDocs.forEach(doc => {
  const docPath = path.join(process.cwd(), doc);
  if (fs.existsSync(docPath)) {
    console.log(`  ✅ ${doc} found`);
    hasSecurityDocs = true;
  }
});

if (!hasSecurityDocs) {
  console.log('  ⚠️  No security documentation found');
  securityIssues.push('Security documentation missing');
}

console.log('\n🏷️  Checking dependency security:');

// Check for security audit script
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (packageJson.scripts && packageJson.scripts['audit']) {
  console.log('  ✅ Security audit script available');
} else {
  console.log('  ⚠️  No security audit script configured');
  securityIssues.push('Security audit script missing');
}

console.log('\n📊 Security Check Summary:');

if (securityIssues.length === 0) {
  console.log('🎉 Security configuration check PASSED');
  console.log('✅ No security issues found');
  process.exit(0);
} else {
  console.log('⚠️  Security configuration check completed with warnings:');
  securityIssues.forEach(issue => {
    console.log(`  - ${issue}`);
  });

  console.log('\n💡 Recommendations:');
  console.log('  - Review and fix security warnings before deployment');
  console.log('  - Run npm audit to check for vulnerable dependencies');
  console.log('  - Ensure all secrets are properly managed');
  console.log('  - Consider using secret management services');

  // Exit with warning but don't fail the build
  process.exit(0);
}
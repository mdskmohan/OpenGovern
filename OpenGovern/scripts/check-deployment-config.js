#!/usr/bin/env node

/**
 * Deployment Configuration Check Script
 *
 * This script validates that all necessary configuration files and
 * environment variables are present for deployment.
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Checking deployment configuration...\n');

// Check for required files
const requiredFiles = [
  '.env.example',
  'infrastructure/docker/Dockerfile',
  'infrastructure/docker/docker-compose.yml',
  'package.json',
  'README.md'
];

let allFilesPresent = true;

console.log('📁 Checking required files:');
requiredFiles.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    allFilesPresent = false;
  }
});

console.log('\n🏗️  Checking service configurations:');

// Check service directories
const services = [
  'frontend',
  'backend/metadata-service',
  'backend/policy-service',
  'backend/workflow-service',
  'backend/alerts-service',
  'backend/integration-service',
  'backend/ai-service',
  'backend/reverse-sync-service'
];

let allServicesConfigured = true;

services.forEach(service => {
  const servicePath = path.join(process.cwd(), service);
  const packageJsonPath = path.join(servicePath, 'package.json');

  if (fs.existsSync(packageJsonPath)) {
    console.log(`  ✅ ${service}`);
  } else {
    console.log(`  ❌ ${service} - package.json missing`);
    allServicesConfigured = false;
  }
});

console.log('\n🔧 Checking environment variables:');

// Check .env.example for required variables
const envExamplePath = path.join(process.cwd(), '.env.example');
if (fs.existsSync(envExamplePath)) {
  const envContent = fs.readFileSync(envExamplePath, 'utf8');
  const requiredVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_SECRET',
    'OPENMETADATA_URL',
    'OPA_URL'
  ];

  let allVarsPresent = true;
  requiredVars.forEach(varName => {
    if (envContent.includes(varName)) {
      console.log(`  ✅ ${varName}`);
    } else {
      console.log(`  ❌ ${varName} - MISSING`);
      allVarsPresent = false;
    }
  });

  if (!allVarsPresent) {
    console.log('\n❌ Some required environment variables are missing from .env.example');
    process.exit(1);
  }
} else {
  console.log('  ❌ .env.example file missing');
  process.exit(1);
}

console.log('\n📊 Checking Docker configuration:');

// Check Dockerfile
const dockerfilePath = path.join(process.cwd(), 'infrastructure/docker/Dockerfile');
if (fs.existsSync(dockerfilePath)) {
  console.log('  ✅ Dockerfile present');
} else {
  console.log('  ❌ Dockerfile missing');
  process.exit(1);
}

// Check docker-compose
const composePath = path.join(process.cwd(), 'infrastructure/docker/docker-compose.yml');
if (fs.existsSync(composePath)) {
  console.log('  ✅ docker-compose.yml present');
} else {
  console.log('  ❌ docker-compose.yml missing');
  process.exit(1);
}

if (allFilesPresent && allServicesConfigured) {
  console.log('\n🎉 Deployment configuration check PASSED');
  console.log('✅ All required files and configurations are present');
  process.exit(0);
} else {
  console.log('\n❌ Deployment configuration check FAILED');
  console.log('Please fix the missing files/configurations before deploying');
  process.exit(1);
}
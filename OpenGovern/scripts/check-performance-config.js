#!/usr/bin/env node

/**
 * Performance Configuration Check Script
 *
 * This script validates performance-related configurations and
 * identifies potential performance bottlenecks.
 */

const fs = require('fs');
const path = require('path');

console.log('⚡ Checking performance configuration...\n');

// Check for performance-related files
const perfFiles = [
  'package.json',
  'infrastructure/docker/docker-compose.yml'
];

console.log('📁 Checking performance configuration files:');
perfFiles.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    console.log(`  ✅ ${file}`);
  } else {
    console.log(`  ❌ ${file} - MISSING`);
    process.exit(1);
  }
});

console.log('\n🔧 Checking build optimization:');

// Check package.json for build optimization
const packageJsonPath = path.join(process.cwd(), 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Check for bundle analyzer
if (packageJson.scripts && packageJson.scripts['analyze-bundle']) {
  console.log('  ✅ Bundle analyzer configured');
} else {
  console.log('  ⚠️  Bundle analyzer not configured');
}

console.log('\n🐳 Checking Docker performance:');

// Check docker-compose for resource limits
const composePath = path.join(process.cwd(), 'infrastructure/docker/docker-compose.yml');
if (fs.existsSync(composePath)) {
  const composeContent = fs.readFileSync(composePath, 'utf8');

  if (composeContent.includes('deploy:') && composeContent.includes('resources:')) {
    console.log('  ✅ Docker resource limits configured');
  } else {
    console.log('  ⚠️  Docker resource limits not configured');
  }

  // Check for health checks
  if (composeContent.includes('healthcheck:')) {
    console.log('  ✅ Docker health checks configured');
  } else {
    console.log('  ⚠️  Docker health checks not configured');
  }
}

console.log('\n📊 Checking caching configuration:');

// Check for Redis configuration
const envExamplePath = path.join(process.cwd(), '.env.example');
if (fs.existsSync(envExamplePath)) {
  const envContent = fs.readFileSync(envExamplePath, 'utf8');

  if (envContent.includes('REDIS_URL')) {
    console.log('  ✅ Redis caching configured');
  } else {
    console.log('  ⚠️  Redis caching not configured');
  }
}

console.log('\n🗄️  Checking database optimization:');

// Check for database connection pooling
if (fs.existsSync(envExamplePath)) {
  const envContent = fs.readFileSync(envExamplePath, 'utf8');

  if (envContent.includes('DB_POOL_MIN') || envContent.includes('DB_POOL_MAX')) {
    console.log('  ✅ Database connection pooling configured');
  } else {
    console.log('  ⚠️  Database connection pooling not configured');
  }
}

console.log('\n🌐 Checking CDN and static asset optimization:');

// Check for CDN configuration
if (fs.existsSync(envExamplePath)) {
  const envContent = fs.readFileSync(envExamplePath, 'utf8');

  if (envContent.includes('CDN_URL') || envContent.includes('CLOUDFRONT_URL')) {
    console.log('  ✅ CDN configuration present');
  } else {
    console.log('  ⚠️  CDN configuration not found');
  }
}

console.log('\n📈 Checking monitoring and metrics:');

// Check for monitoring configuration
if (fs.existsSync(envExamplePath)) {
  const envContent = fs.readFileSync(envExamplePath, 'utf8');

  const monitoringVars = ['DATADOG_API_KEY', 'NEW_RELIC_LICENSE_KEY', 'PROMETHEUS_URL'];
  let hasMonitoring = false;

  monitoringVars.forEach(varName => {
    if (envContent.includes(varName)) {
      hasMonitoring = true;
    }
  });

  if (hasMonitoring) {
    console.log('  ✅ Application monitoring configured');
  } else {
    console.log('  ⚠️  Application monitoring not configured');
  }
}

console.log('\n⚖️  Checking load balancing configuration:');

// Check docker-compose for load balancing
if (fs.existsSync(composePath)) {
  const composeContent = fs.readFileSync(composePath, 'utf8');

  if (composeContent.includes('replicas:') && composeContent.includes('replicas:').match(/\d+/)[0] > 1) {
    console.log('  ✅ Load balancing configured (multiple replicas)');
  } else {
    console.log('  ⚠️  Load balancing not configured');
  }
}

console.log('\n💾 Checking memory and storage optimization:');

// Check for memory limits
if (fs.existsSync(composePath)) {
  const composeContent = fs.readFileSync(composePath, 'utf8');

  if (composeContent.includes('memory:') || composeContent.includes('mem_limit:')) {
    console.log('  ✅ Memory limits configured');
  } else {
    console.log('  ⚠️  Memory limits not configured');
  }
}

console.log('\n📋 Performance Check Summary:');

console.log('✅ Performance configuration check completed');
console.log('\n💡 Performance Optimization Recommendations:');
console.log('  - Configure resource limits in docker-compose.yml');
console.log('  - Set up database connection pooling');
console.log('  - Implement CDN for static assets');
console.log('  - Configure application monitoring');
console.log('  - Set up load balancing with multiple replicas');
console.log('  - Use bundle analyzer to optimize bundle size');
console.log('  - Implement caching strategies (Redis)');
console.log('  - Configure health checks for all services');

process.exit(0);
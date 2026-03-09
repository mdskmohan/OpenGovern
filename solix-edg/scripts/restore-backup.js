#!/usr/bin/env node

/**
 * Backup Restoration Script
 *
 * This script restores OpenGovern platform from a backup archive
 * including database, configuration, and application data.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔄 Restoring OpenGovern from backup...\n');

// Get backup file from command line argument
const backupFile = process.argv[2];
if (!backupFile) {
  console.error('❌ Usage: npm run backup:restore <backup-file.tar.gz>');
  process.exit(1);
}

const backupPath = path.resolve(backupFile);
if (!fs.existsSync(backupPath)) {
  console.error(`❌ Backup file not found: ${backupPath}`);
  process.exit(1);
}

console.log(`📦 Backup file: ${backupPath}`);

const restoreDir = path.join(process.cwd(), 'restore_temp');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

try {
  // Create temporary restore directory
  fs.mkdirSync(restoreDir, { recursive: true });

  console.log(`📁 Temporary restore directory: ${restoreDir}`);

  // Extract backup archive
  console.log('\n📦 Extracting backup archive...');
  execSync(`tar -xzf ${backupPath} -C ${restoreDir}`, { stdio: 'inherit' });
  console.log('  ✅ Backup extracted successfully');

  // Verify backup integrity
  console.log('\n🔍 Verifying backup integrity...');
  const manifestPath = path.join(restoreDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Backup manifest not found');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`  ✅ Backup created: ${manifest.timestamp}`);
  console.log(`  ✅ Version: ${manifest.version}`);
  console.log(`  ✅ Components: ${manifest.components.join(', ')}`);

  // Verify checksums
  const crypto = require('crypto');
  let checksumsValid = true;

  Object.entries(manifest.checksums).forEach(([file, expectedChecksum]) => {
    const filePath = path.join(restoreDir, file);
    if (fs.existsSync(filePath)) {
      const actualChecksum = crypto.createHash('sha256')
        .update(fs.readFileSync(filePath))
        .digest('hex');

      if (actualChecksum !== expectedChecksum) {
        console.log(`  ❌ Checksum mismatch for ${file}`);
        checksumsValid = false;
      }
    } else {
      console.log(`  ❌ File missing: ${file}`);
      checksumsValid = false;
    }
  });

  if (!checksumsValid) {
    throw new Error('Backup integrity check failed');
  }

  console.log('  ✅ Backup integrity verified');

  // Create backup of current state before restoration
  console.log('\n💾 Creating pre-restore backup...');
  const preRestoreBackup = `pre-restore-backup-${timestamp}.tar.gz`;
  execSync(`tar -czf ${preRestoreBackup} --exclude=node_modules --exclude=.next --exclude=backups .`, { stdio: 'inherit' });
  console.log(`  ✅ Pre-restore backup created: ${preRestoreBackup}`);

  // Stop services before restoration
  console.log('\n🛑 Stopping services...');
  try {
    execSync('docker-compose -f infrastructure/docker/docker-compose.yml down', { stdio: 'inherit' });
    console.log('  ✅ Services stopped');
  } catch (error) {
    console.log('  ⚠️  Could not stop services:', error.message);
  }

  // Restore database
  if (manifest.components.includes('database')) {
    console.log('\n🗄️  Restoring database...');
    const dbBackupPath = path.join(restoreDir, 'database.sql');
    if (fs.existsSync(dbBackupPath)) {
      try {
        execSync(`pg_restore --clean --if-exists --create ${dbBackupPath}`, {
          stdio: 'inherit',
          env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD }
        });
        console.log('  ✅ Database restored');
      } catch (error) {
        console.log('  ❌ Database restoration failed:', error.message);
        console.log('  💡 You may need to restore the database manually');
      }
    }
  }

  // Restore Redis data
  if (manifest.components.includes('redis')) {
    console.log('\n🔄 Restoring Redis data...');
    const redisBackupPath = path.join(restoreDir, 'redis.rdb');
    if (fs.existsSync(redisBackupPath)) {
      try {
        execSync(`redis-cli FLUSHALL && redis-cli --rdb ${redisBackupPath}`, { stdio: 'inherit' });
        console.log('  ✅ Redis data restored');
      } catch (error) {
        console.log('  ❌ Redis restoration failed:', error.message);
      }
    }
  }

  // Restore configuration files
  if (manifest.components.includes('configuration')) {
    console.log('\n⚙️  Restoring configuration files...');
    const configFiles = [
      '.env',
      'package.json',
      'package-lock.json',
      'infrastructure/docker/docker-compose.yml',
      'infrastructure/docker/Dockerfile'
    ];

    configFiles.forEach(file => {
      const srcPath = path.join(restoreDir, file);
      const destPath = path.join(process.cwd(), file);

      if (fs.existsSync(srcPath)) {
        // Create backup of current file
        if (fs.existsSync(destPath)) {
          fs.copyFileSync(destPath, `${destPath}.backup`);
        }

        // Restore from backup
        fs.copyFileSync(srcPath, destPath);
        console.log(`  ✅ ${file} restored`);
      }
    });
  }

  // Restore user data
  if (manifest.components.includes('user-data')) {
    console.log('\n📎 Restoring user data...');
    const uploadsBackupPath = path.join(restoreDir, 'uploads.tar.gz');
    if (fs.existsSync(uploadsBackupPath)) {
      const uploadsDir = path.join(process.cwd(), 'uploads');
      fs.mkdirSync(uploadsDir, { recursive: true });
      execSync(`tar -xzf ${uploadsBackupPath} -C ${uploadsDir}`, { stdio: 'inherit' });
      console.log('  ✅ User data restored');
    }
  }

  // Install dependencies
  console.log('\n📦 Installing dependencies...');
  try {
    execSync('npm install', { stdio: 'inherit' });
    console.log('  ✅ Dependencies installed');
  } catch (error) {
    console.log('  ❌ Dependency installation failed:', error.message);
  }

  // Start services
  console.log('\n🚀 Starting services...');
  try {
    execSync('docker-compose -f infrastructure/docker/docker-compose.yml up -d', { stdio: 'inherit' });
    console.log('  ✅ Services started');
  } catch (error) {
    console.log('  ❌ Service startup failed:', error.message);
  }

  // Run database migrations
  console.log('\n🗄️  Running database migrations...');
  try {
    execSync('npm run db:migrate', { stdio: 'inherit' });
    console.log('  ✅ Database migrations completed');
  } catch (error) {
    console.log('  ❌ Database migrations failed:', error.message);
  }

  // Clean up temporary files
  console.log('\n🧹 Cleaning up...');
  fs.rmSync(restoreDir, { recursive: true, force: true });
  console.log('  ✅ Temporary files cleaned up');

  // Run health checks
  console.log('\n🏥 Running health checks...');
  try {
    execSync('npm run monitoring:health', { stdio: 'inherit' });
    console.log('  ✅ Health checks passed');
  } catch (error) {
    console.log('  ⚠️  Health checks failed - please verify the restoration manually');
  }

  console.log('\n🎉 Backup restoration completed!');
  console.log(`📋 Backup version: ${manifest.version}`);
  console.log(`🗂️  Components restored: ${manifest.components.join(', ')}`);
  console.log(`💾 Pre-restore backup: ${preRestoreBackup}`);

  console.log('\n✅ Next steps:');
  console.log('  1. Verify application functionality');
  console.log('  2. Check user data integrity');
  console.log('  3. Test critical workflows');
  console.log('  4. Monitor for any issues');

} catch (error) {
  console.error('❌ Backup restoration failed:', error.message);

  // Clean up on failure
  if (fs.existsSync(restoreDir)) {
    fs.rmSync(restoreDir, { recursive: true, force: true });
  }

  console.log('\n💡 Restoration failed. You can:');
  console.log('  1. Check the error message above');
  console.log('  2. Restore from the pre-restore backup if needed');
  console.log('  3. Contact support for assistance');

  process.exit(1);
}
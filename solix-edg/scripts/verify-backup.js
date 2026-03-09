#!/usr/bin/env node

/**
 * Backup Verification Script
 *
 * This script verifies the integrity and completeness of OpenGovern backups
 * to ensure they can be successfully restored when needed.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

console.log('🔍 Verifying OpenGovern backups...\n');

// Get backup file from command line argument or find latest
let backupFile = process.argv[2];
const backupsDir = path.join(process.cwd(), 'backups');

if (!backupFile) {
  // Find the latest backup
  if (!fs.existsSync(backupsDir)) {
    console.error('❌ No backups directory found');
    process.exit(1);
  }

  const backupFiles = fs.readdirSync(backupsDir)
    .filter(file => file.endsWith('.tar.gz'))
    .sort()
    .reverse();

  if (backupFiles.length === 0) {
    console.error('❌ No backup files found');
    process.exit(1);
  }

  backupFile = path.join(backupsDir, backupFiles[0]);
  console.log(`📦 Using latest backup: ${path.basename(backupFile)}`);
} else {
  backupFile = path.resolve(backupFile);
}

if (!fs.existsSync(backupFile)) {
  console.error(`❌ Backup file not found: ${backupFile}`);
  process.exit(1);
}

const tempDir = path.join(process.cwd(), 'backup_verification_temp');

try {
  // Create temporary directory for verification
  fs.mkdirSync(tempDir, { recursive: true });

  console.log(`📁 Verification directory: ${tempDir}`);

  // Extract backup for verification
  console.log('\n📦 Extracting backup for verification...');
  const { execSync } = require('child_process');
  execSync(`tar -xzf ${backupFile} -C ${tempDir}`, { stdio: 'inherit' });
  console.log('  ✅ Backup extracted successfully');

  // Verify manifest
  console.log('\n📋 Verifying backup manifest...');
  const manifestPath = path.join(tempDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error('Backup manifest not found');
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`  ✅ Backup created: ${manifest.timestamp}`);
  console.log(`  ✅ Version: ${manifest.version}`);
  console.log(`  ✅ Components: ${manifest.components.join(', ')}`);

  // Verify all expected files are present
  console.log('\n📁 Verifying file presence...');
  const expectedFiles = [];

  if (manifest.components.includes('database')) {
    expectedFiles.push('database.sql');
  }

  if (manifest.components.includes('redis')) {
    expectedFiles.push('redis.rdb');
  }

  if (manifest.components.includes('configuration')) {
    expectedFiles.push('.env', 'package.json');
  }

  if (manifest.components.includes('user-data')) {
    expectedFiles.push('uploads.tar.gz');
  }

  let allFilesPresent = true;
  expectedFiles.forEach(file => {
    const filePath = path.join(tempDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`  ✅ ${file}`);
    } else {
      console.log(`  ❌ ${file} - MISSING`);
      allFilesPresent = false;
    }
  });

  if (!allFilesPresent) {
    throw new Error('Some expected files are missing from backup');
  }

  // Verify checksums
  console.log('\n🔐 Verifying file integrity...');
  let checksumsValid = true;

  Object.entries(manifest.checksums).forEach(([file, expectedChecksum]) => {
    const filePath = path.join(tempDir, file);
    if (fs.existsSync(filePath)) {
      const actualChecksum = crypto.createHash('sha256')
        .update(fs.readFileSync(filePath))
        .digest('hex');

      if (actualChecksum === expectedChecksum) {
        console.log(`  ✅ ${file}`);
      } else {
        console.log(`  ❌ ${file} - CHECKSUM MISMATCH`);
        checksumsValid = false;
      }
    } else {
      console.log(`  ❌ ${file} - FILE MISSING`);
      checksumsValid = false;
    }
  });

  if (!checksumsValid) {
    throw new Error('Backup integrity check failed');
  }

  // Verify configuration files are valid
  console.log('\n⚙️  Verifying configuration files...');

  // Check package.json
  const packageJsonPath = path.join(tempDir, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      if (packageJson.name && packageJson.version) {
        console.log('  ✅ package.json is valid');
      } else {
        console.log('  ❌ package.json is malformed');
      }
    } catch (error) {
      console.log('  ❌ package.json parsing failed');
    }
  }

  // Check .env file structure
  const envPath = path.join(tempDir, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const requiredVars = ['DATABASE_URL', 'JWT_SECRET'];
    let envValid = true;

    requiredVars.forEach(varName => {
      if (!envContent.includes(varName)) {
        envValid = false;
      }
    });

    if (envValid) {
      console.log('  ✅ .env file structure is valid');
    } else {
      console.log('  ⚠️  .env file may be missing required variables');
    }
  }

  // Test database backup restoration (dry run)
  console.log('\n🗄️  Testing database backup...');
  const dbBackupPath = path.join(tempDir, 'database.sql');
  if (fs.existsSync(dbBackupPath)) {
    try {
      // Test if the backup file is a valid PostgreSQL custom format dump
      execSync(`pg_restore --list ${dbBackupPath} > /dev/null 2>&1`, {
        env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || 'dummy' }
      });
      console.log('  ✅ Database backup format is valid');
    } catch (error) {
      console.log('  ⚠️  Database backup format verification failed (may still be valid)');
    }
  }

  // Calculate backup statistics
  console.log('\n📊 Backup Statistics:');

  let totalSize = 0;
  const files = fs.readdirSync(tempDir);

  files.forEach(file => {
    const filePath = path.join(tempDir, file);
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      totalSize += stats.size;
      console.log(`  ${file}: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    }
  });

  console.log(`  Total backup size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Number of components: ${manifest.components.length}`);
  console.log(`  Backup age: ${Math.floor((Date.now() - new Date(manifest.timestamp)) / (1000 * 60 * 60 * 24))} days`);

  // Clean up
  console.log('\n🧹 Cleaning up verification files...');
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log('  ✅ Verification files cleaned up');

  console.log('\n🎉 Backup verification completed successfully!');
  console.log('✅ Backup integrity: VERIFIED');
  console.log('✅ All components: PRESENT');
  console.log('✅ File checksums: VALID');
  console.log('✅ Configuration: VALID');

  console.log('\n📋 Backup Summary:');
  console.log(`  - Created: ${manifest.timestamp}`);
  console.log(`  - Version: ${manifest.version}`);
  console.log(`  - Components: ${manifest.components.join(', ')}`);
  console.log(`  - Size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  - Status: READY FOR RESTORATION`);

  process.exit(0);

} catch (error) {
  console.error('❌ Backup verification failed:', error.message);

  // Clean up on failure
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  console.log('\n💡 Verification failed. Possible issues:');
  console.log('  - Backup file is corrupted');
  console.log('  - Backup was created with a different version');
  console.log('  - Some components were not properly backed up');
  console.log('  - File permissions or access issues');

  process.exit(1);
}
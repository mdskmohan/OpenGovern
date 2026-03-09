#!/usr/bin/env node

/**
 * Backup Creation Script
 *
 * This script creates comprehensive backups of the OpenGovern platform
 * including database, configuration, and application data.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('💾 Creating OpenGovern backup...\n');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = path.join(process.cwd(), 'backups', timestamp);

try {
  // Create backup directory
  fs.mkdirSync(backupDir, { recursive: true });

  console.log(`📁 Backup directory: ${backupDir}`);

  // Backup database
  console.log('\n🗄️  Backing up database...');
  try {
    const dbBackupPath = path.join(backupDir, 'database.sql');
    execSync(`pg_dump --format=custom --compress=9 --file=${dbBackupPath} $DATABASE_URL`, {
      stdio: 'inherit',
      env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD }
    });
    console.log('  ✅ Database backup completed');
  } catch (error) {
    console.log('  ❌ Database backup failed:', error.message);
  }

  // Backup Redis data
  console.log('\n🔄 Backing up Redis data...');
  try {
    const redisBackupPath = path.join(backupDir, 'redis.rdb');
    execSync(`redis-cli --rdb ${redisBackupPath}`, { stdio: 'inherit' });
    console.log('  ✅ Redis backup completed');
  } catch (error) {
    console.log('  ❌ Redis backup failed:', error.message);
  }

  // Backup configuration files
  console.log('\n⚙️  Backing up configuration...');
  try {
    const configFiles = [
      '.env',
      'package.json',
      'package-lock.json',
      'infrastructure/docker/docker-compose.yml',
      'infrastructure/docker/Dockerfile'
    ];

    configFiles.forEach(file => {
      const srcPath = path.join(process.cwd(), file);
      const destPath = path.join(backupDir, path.basename(file));

      if (fs.existsSync(srcPath)) {
        fs.copyFileSync(srcPath, destPath);
        console.log(`  ✅ ${file}`);
      } else {
        console.log(`  ⚠️  ${file} not found`);
      }
    });
  } catch (error) {
    console.log('  ❌ Configuration backup failed:', error.message);
  }

  // Backup user uploads/documents
  console.log('\n📎 Backing up user data...');
  try {
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const uploadsBackupPath = path.join(backupDir, 'uploads.tar.gz');
      execSync(`tar -czf ${uploadsBackupPath} -C ${uploadsDir} .`, { stdio: 'inherit' });
      console.log('  ✅ User data backup completed');
    } else {
      console.log('  ⚠️  No uploads directory found');
    }
  } catch (error) {
    console.log('  ❌ User data backup failed:', error.message);
  }

  // Create backup manifest
  console.log('\n📋 Creating backup manifest...');
  const manifest = {
    timestamp: new Date().toISOString(),
    version: require('../package.json').version,
    components: [],
    checksums: {}
  };

  // Calculate checksums
  const crypto = require('crypto');
  fs.readdirSync(backupDir).forEach(file => {
    const filePath = path.join(backupDir, file);
    if (fs.statSync(filePath).isFile()) {
      const checksum = crypto.createHash('sha256')
        .update(fs.readFileSync(filePath))
        .digest('hex');
      manifest.checksums[file] = checksum;

      // Categorize components
      if (file.includes('database')) {
        manifest.components.push('database');
      } else if (file.includes('redis')) {
        manifest.components.push('redis');
      } else if (file.includes('.env') || file.includes('config')) {
        manifest.components.push('configuration');
      } else if (file.includes('uploads')) {
        manifest.components.push('user-data');
      }
    }
  });

  // Remove duplicates
  manifest.components = [...new Set(manifest.components)];

  // Save manifest
  const manifestPath = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log('  ✅ Backup manifest created');

  // Create compressed archive
  console.log('\n📦 Creating compressed backup archive...');
  const archiveName = `solix-edg-backup-${timestamp}.tar.gz`;
  const archivePath = path.join(process.cwd(), 'backups', archiveName);

  execSync(`tar -czf ${archivePath} -C ${backupDir} .`, { stdio: 'inherit' });

  console.log(`  ✅ Backup archive created: ${archiveName}`);

  // Clean up temporary directory
  fs.rmSync(backupDir, { recursive: true, force: true });

  console.log('\n🎉 Backup creation completed successfully!');
  console.log(`📂 Backup location: ${archivePath}`);
  console.log(`📏 Backup size: ${fs.statSync(archivePath).size} bytes`);
  console.log(`🗂️  Components backed up: ${manifest.components.join(', ')}`);

} catch (error) {
  console.error('❌ Backup creation failed:', error.message);
  process.exit(1);
}
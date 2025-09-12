#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get version from package.json or environment variable
const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
const version = process.env.APP_VERSION || packageJson.version;

// Get repository info from package.json or environment
const repository = process.env.GITHUB_REPOSITORY || 'Jackolix/ticketbase-desktop';

// Read the current tauri.conf.json
const configPath = path.join(__dirname, '../src-tauri/tauri.conf.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Update version
config.version = version;

// Update updater endpoint with dynamic repository
config.plugins.updater.endpoints = [
  `https://github.com/${repository}/releases/latest/download/latest.json`
];

// Write the updated config back
fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

console.log(`✅ Updated tauri.conf.json:`);
console.log(`   Version: ${version}`);
console.log(`   Repository: ${repository}`);
console.log(`   Endpoint: ${config.plugins.updater.endpoints[0]}`);
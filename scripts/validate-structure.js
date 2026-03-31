#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Required directories and files for the project structure
const requiredStructure = {
  'services/canvas-service': ['package.json', 'Dockerfile', 'tsconfig.json', 'src/index.ts'],
  'services/room-service': ['package.json', 'Dockerfile', 'tsconfig.json', 'src/index.ts'],
  'services/physics-service': ['go.mod', 'Dockerfile', 'main.go'],
  'services/database/init': ['01-init.sql'],
  'frontend': ['package.json', 'Dockerfile', 'tsconfig.json', 'next.config.js', 'src/pages/index.tsx'],
  'shared': ['package.json', 'tsconfig.json', 'src/index.ts', 'src/types/index.ts', 'src/utils/index.ts'],
  'shared/proto': ['physics.proto'],
  '.': ['docker-compose.yml', '.env.example', '.env', 'nginx.conf', 'package.json', 'README.md', '.gitignore']
};

function validateStructure() {
  console.log('🔍 Validating project structure...\n');
  
  let allValid = true;
  
  for (const [dir, files] of Object.entries(requiredStructure)) {
    console.log(`📁 Checking ${dir}/`);
    
    // Check if directory exists
    if (!fs.existsSync(dir)) {
      console.log(`  ❌ Directory ${dir} does not exist`);
      allValid = false;
      continue;
    }
    
    // Check required files
    for (const file of files) {
      const filePath = path.join(dir, file);
      if (fs.existsSync(filePath)) {
        console.log(`  ✅ ${file}`);
      } else {
        console.log(`  ❌ ${file} missing`);
        allValid = false;
      }
    }
    console.log('');
  }
  
  if (allValid) {
    console.log('🎉 Project structure validation passed!');
    console.log('\n📋 Next steps:');
    console.log('  1. Run: npm install (install root dependencies)');
    console.log('  2. Run: make install (install all service dependencies)');
    console.log('  3. Run: npm run dev (start development environment)');
  } else {
    console.log('❌ Project structure validation failed!');
    console.log('Please ensure all required files and directories are present.');
    process.exit(1);
  }
}

validateStructure();
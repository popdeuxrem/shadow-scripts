#!/usr/bin/env node
/**
 * scripts/validate-package.js
 * Validates package.json configuration and tests key functionality
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(PROJECT_ROOT, 'package.json');

function readPackageJson() {
  if (!fs.existsSync(PACKAGE_JSON_PATH)) {
    throw new Error('package.json not found');
  }
  
  return JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf8'));
}

function validateBasicStructure(pkg) {
  console.log('\n🔍 Validating basic package structure...');
  
  const required = ['name', 'version', 'description', 'scripts'];
  const issues = [];
  
  required.forEach(field => {
    if (!pkg[field]) {
      issues.push(`Missing required field: ${field}`);
    } else {
      console.log(`  ✅ ${field}: ${typeof pkg[field] === 'object' ? 'configured' : pkg[field]}`);
    }
  });
  
  return issues;
}

function validateEngines(pkg) {
  console.log('\n🔍 Validating engine requirements...');
  
  const issues = [];
  
  if (!pkg.engines) {
    issues.push('Missing engines specification');
    return issues;
  }
  
  if (!pkg.engines.node) {
    issues.push('Missing Node.js engine requirement');
  } else {
    console.log(`  ✅ Node.js: ${pkg.engines.node}`);
    
    // Check if current Node version meets requirement
    const currentNodeVersion = process.version;
    const requiredNodeVersion = pkg.engines.node.replace('>=', '');
    console.log(`  📊 Current Node.js: ${currentNodeVersion}`);
  }
  
  if (!pkg.engines.npm) {
    issues.push('Missing npm engine requirement');
  } else {
    console.log(`  ✅ npm: ${pkg.engines.npm}`);
  }
  
  return issues;
}

function validateScripts(pkg) {
  console.log('\n🔍 Validating npm scripts...');
  
  const expectedScripts = [
    'build',
    'test',
    'validate',
    'obfuscate',
    'generate:manifest',
    'generate:configs',
    'security:scan',
    'info'
  ];
  
  const issues = [];
  
  expectedScripts.forEach(script => {
    if (pkg.scripts[script]) {
      console.log(`  ✅ ${script}: ${pkg.scripts[script]}`);
    } else {
      issues.push(`Missing expected script: ${script}`);
    }
  });
  
  console.log(`  📊 Total scripts: ${Object.keys(pkg.scripts).length}`);
  
  return issues;
}

function validateDependencies(pkg) {
  console.log('\n🔍 Validating dependencies...');
  
  const issues = [];
  
  // Check for essential dependencies
  const essentialDeps = [
    'javascript-obfuscator',
    'js-yaml',
    'plist',
    'uuid'
  ];
  
  essentialDeps.forEach(dep => {
    if (pkg.dependencies && pkg.dependencies[dep]) {
      console.log(`  ✅ ${dep}: ${pkg.dependencies[dep]}`);
    } else {
      issues.push(`Missing essential dependency: ${dep}`);
    }
  });
  
  // Check dependency counts
  const depCount = pkg.dependencies ? Object.keys(pkg.dependencies).length : 0;
  const devDepCount = pkg.devDependencies ? Object.keys(pkg.devDependencies).length : 0;
  
  console.log(`  📊 Production dependencies: ${depCount}`);
  console.log(`  📊 Development dependencies: ${devDepCount}`);
  
  if (depCount > 10) {
    issues.push('Too many production dependencies (keep minimal)');
  }
  
  return issues;
}

function testScripts(pkg) {
  console.log('\n🔍 Testing key scripts...');
  
  const testsToRun = [
    { script: 'info', timeout: 5000 },
    { script: 'validate:gitignore', timeout: 10000 },
    { script: 'validate:workflows', timeout: 10000 }
  ];
  
  const results = [];
  
  testsToRun.forEach(test => {
    try {
      console.log(`  🧪 Testing: npm run ${test.script}`);
      
      const output = execSync(`npm run ${test.script}`, {
        cwd: PROJECT_ROOT,
        timeout: test.timeout,
        stdio: 'pipe',
        encoding: 'utf8'
      });
      
      console.log(`  ✅ ${test.script}: Success`);
      results.push({ script: test.script, success: true });
      
    } catch (error) {
      console.log(`  ❌ ${test.script}: Failed (${error.message})`);
      results.push({ script: test.script, success: false, error: error.message });
    }
  });
  
  return results;
}

function validateConfiguration(pkg) {
  console.log('\n🔍 Validating configuration settings...');
  
  const issues = [];
  
  if (!pkg.config) {
    issues.push('Missing configuration section');
    return issues;
  }
  
  // Check obfuscation config
  if (pkg.config.obfuscation) {
    console.log(`  ✅ Obfuscation default profile: ${pkg.config.obfuscation.defaultProfile}`);
    console.log(`  ✅ Output encoding: ${pkg.config.obfuscation.outputEncoding}`);
  } else {
    issues.push('Missing obfuscation configuration');
  }
  
  // Check build config
  if (pkg.config.build) {
    console.log(`  ✅ Build output dir: ${pkg.config.build.outputDir}`);
    console.log(`  ✅ Source dir: ${pkg.config.build.sourceDir}`);
  } else {
    issues.push('Missing build configuration');
  }
  
  return issues;
}

function validateMetadata(pkg) {
  console.log('\n🔍 Validating project metadata...');
  
  const issues = [];
  
  const expectedFields = [
    'description',
    'keywords',
    'author',
    'repository',
    'homepage',
    'license'
  ];
  
  expectedFields.forEach(field => {
    if (pkg[field]) {
      const value = typeof pkg[field] === 'object' 
        ? Object.keys(pkg[field]).join(', ')
        : pkg[field];
      console.log(`  ✅ ${field}: ${value}`);
    } else {
      issues.push(`Missing metadata field: ${field}`);
    }
  });
  
  // Validate keywords
  if (pkg.keywords && Array.isArray(pkg.keywords)) {
    console.log(`  📊 Keywords: ${pkg.keywords.length} keywords`);
    if (pkg.keywords.length < 5) {
      issues.push('Should have more keywords for better discoverability');
    }
  }
  
  return issues;
}

function generateReport(allIssues, testResults) {
  console.log('\n📋 Package.json Validation Report');
  console.log('═══════════════════════════════════');
  
  const totalIssues = allIssues.reduce((sum, issues) => sum + issues.length, 0);
  const successfulTests = testResults.filter(r => r.success).length;
  
  console.log(`📦 Package: ${readPackageJson().name} v${readPackageJson().version}`);
  console.log(`📊 Total scripts: ${Object.keys(readPackageJson().scripts).length}`);
  console.log(`🔍 Issues found: ${totalIssues}`);
  console.log(`🧪 Script tests: ${successfulTests}/${testResults.length} passed`);
  
  if (totalIssues === 0 && successfulTests === testResults.length) {
    console.log('\n✅ Package.json validation passed! All checks successful.');
    return true;
  } else {
    console.log('\n❌ Package.json validation has issues:');
    
    if (totalIssues > 0) {
      console.log(`   - ${totalIssues} configuration issues`);
    }
    if (successfulTests < testResults.length) {
      console.log(`   - ${testResults.length - successfulTests} script test failures`);
    }
    
    return false;
  }
}

function main() {
  try {
    console.log('📦 Package.json Validation Tool');
    console.log('================================');
    
    const pkg = readPackageJson();
    const allIssues = [];
    
    // Run all validations
    allIssues.push(validateBasicStructure(pkg));
    allIssues.push(validateEngines(pkg));
    allIssues.push(validateScripts(pkg));
    allIssues.push(validateDependencies(pkg));
    allIssues.push(validateConfiguration(pkg));
    allIssues.push(validateMetadata(pkg));
    
    // Test key scripts
    const testResults = testScripts(pkg);
    
    // Generate final report
    const success = generateReport(allIssues, testResults);
    
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    console.error('❌ Validation failed:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { 
  validateBasicStructure,
  validateEngines,
  validateScripts,
  validateDependencies,
  validateConfiguration,
  validateMetadata
};
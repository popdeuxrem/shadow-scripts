#!/usr/bin/env node
/**
 * scripts/validate-workflows.js
 * Validates GitHub Actions workflow configurations for consistency and best practices
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const WORKFLOWS_DIR = path.join(__dirname, '..', '.github', 'workflows');

function validateWorkflow(filePath, workflowName) {
  console.log(`\n🔍 Validating workflow: ${workflowName}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const workflow = yaml.load(content);
    
    const issues = [];
    const recommendations = [];
    
    // Check basic structure
    if (!workflow.name) {
      issues.push('Missing workflow name');
    }
    
    if (!workflow.on) {
      issues.push('Missing trigger configuration');
    }
    
    if (!workflow.jobs) {
      issues.push('Missing jobs configuration');
    }
    
    // Check Node.js version consistency
    if (workflow.env && workflow.env.NODE_VERSION) {
      if (workflow.env.NODE_VERSION !== '22') {
        recommendations.push(`Consider using Node.js 22 (currently: ${workflow.env.NODE_VERSION})`);
      }
    }
    
    // Check for pnpm usage (should be npm)
    const workflowStr = content.toLowerCase();
    if (workflowStr.includes('pnpm')) {
      issues.push('Workflow still references pnpm, should use npm');
    }
    
    // Check for proper permissions
    let hasProperPermissions = false;
    if (workflow.jobs) {
      Object.values(workflow.jobs).forEach(job => {
        if (job.permissions) {
          hasProperPermissions = true;
        }
      });
    }
    
    if (!hasProperPermissions) {
      recommendations.push('Consider adding explicit permissions to jobs');
    }
    
    // Check for timeout settings
    let hasTimeouts = false;
    if (workflow.jobs) {
      Object.values(workflow.jobs).forEach(job => {
        if (job['timeout-minutes']) {
          hasTimeouts = true;
        }
      });
    }
    
    if (!hasTimeouts) {
      recommendations.push('Consider adding timeout-minutes to prevent hanging jobs');
    }
    
    // Check for artifact uploads
    let hasArtifactUpload = false;
    if (workflow.jobs) {
      Object.values(workflow.jobs).forEach(job => {
        if (job.steps) {
          job.steps.forEach(step => {
            if (step.uses && step.uses.includes('upload-artifact')) {
              hasArtifactUpload = true;
            }
          });
        }
      });
    }
    
    // Report results
    if (issues.length === 0) {
      console.log('  ✅ No critical issues found');
    } else {
      console.log('  ❌ Issues found:');
      issues.forEach(issue => console.log(`    - ${issue}`));
    }
    
    if (recommendations.length > 0) {
      console.log('  💡 Recommendations:');
      recommendations.forEach(rec => console.log(`    - ${rec}`));
    }
    
    return {
      workflow: workflowName,
      issues: issues.length,
      recommendations: recommendations.length,
      hasArtifacts: hasArtifactUpload
    };
    
  } catch (error) {
    console.log(`  ❌ Failed to validate: ${error.message}`);
    return {
      workflow: workflowName,
      issues: 1,
      recommendations: 0,
      error: error.message
    };
  }
}

function main() {
  console.log('🔍 GitHub Actions Workflow Validator\n');
  console.log('Validating workflows in:', WORKFLOWS_DIR);
  
  if (!fs.existsSync(WORKFLOWS_DIR)) {
    console.log('❌ Workflows directory not found');
    process.exit(1);
  }
  
  const workflowFiles = fs.readdirSync(WORKFLOWS_DIR)
    .filter(file => file.endsWith('.yml') || file.endsWith('.yaml'));
  
  if (workflowFiles.length === 0) {
    console.log('❌ No workflow files found');
    process.exit(1);
  }
  
  const results = [];
  
  workflowFiles.forEach(file => {
    const filePath = path.join(WORKFLOWS_DIR, file);
    const workflowName = path.basename(file, path.extname(file));
    const result = validateWorkflow(filePath, workflowName);
    results.push(result);
  });
  
  // Summary
  console.log('\n📊 Validation Summary');
  console.log('══════════════════════');
  
  const totalIssues = results.reduce((sum, r) => sum + r.issues, 0);
  const totalRecommendations = results.reduce((sum, r) => sum + r.recommendations, 0);
  
  console.log(`Workflows validated: ${results.length}`);
  console.log(`Total issues: ${totalIssues}`);
  console.log(`Total recommendations: ${totalRecommendations}`);
  
  if (totalIssues === 0) {
    console.log('\n✅ All workflows passed validation!');
    process.exit(0);
  } else {
    console.log('\n❌ Some workflows have issues that need attention');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { validateWorkflow };
const fs = require('fs');
const path = require('path');

const root = __dirname;

const toDelete = [
  // Supabase
  'src/services/supabase',
  // Auth page
  'src/pages/Auth',
  // Analytics page
  'src/pages/Dashboard/Analytics.tsx',
  // ProtectedRoute
  'src/components/layout/ProtectedRoute.tsx',
  // Bug-tracker components
  'src/components/profile/SeverityBadge.tsx',
  'src/components/profile/StatusBadge.tsx',
  // Triage index page
  'src/pages/Onboarding/Index.tsx',
  // Old env example
  '.env.example',
  // Old restructure script
  'restructure.js',
  'restructure.cjs',
];

toDelete.forEach(target => {
  const full = path.join(root, target);
  if (fs.existsSync(full)) {
    fs.rmSync(full, { recursive: true, force: true });
    console.log(`✅ Deleted: ${target}`);
  } else {
    console.log(`⏭️  Already gone: ${target}`);
  }
});

// Remove @supabase/supabase-js from package.json
const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
if (pkg.dependencies && pkg.dependencies['@supabase/supabase-js']) {
  delete pkg.dependencies['@supabase/supabase-js'];
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('✅ Removed @supabase/supabase-js from package.json');
}

console.log('\n🎉 Cleanup complete! Run "npm install" to update node_modules.');

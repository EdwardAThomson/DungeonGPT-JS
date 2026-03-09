const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../src/utils/inventorySystem.js');

function checkDuplicates() {
  if (!fs.existsSync(FILE_PATH)) {
    console.error(`File not found: ${FILE_PATH}`);
    return;
  }

  const content = fs.readFileSync(FILE_PATH, 'utf8');
  
  // 1. Extract ITEM_CATALOG block
  const catalogMatch = content.match(/export const ITEM_CATALOG = {([\s\S]+?)\n};/);
  if (!catalogMatch) {
    console.error('Could not find ITEM_CATALOG in inventorySystem.js');
    return;
  }
  
  const catalogEntries = catalogMatch[1];
  
  // 2. Check for duplicate keys in the source (overwritten keys)
  // This regex matches keys at the start of a line within the catalog
  const keyRegex = /^\s*['"]?(\w+)['"]?:\s*{/gm;
  const keys = [];
  let match;
  while ((match = keyRegex.exec(catalogEntries)) !== null) {
    keys.push(match[1]);
  }
  
  const keyCounts = {};
  const duplicateKeys = [];
  keys.forEach(key => {
    keyCounts[key] = (keyCounts[key] || 0) + 1;
    if (keyCounts[key] === 2) duplicateKeys.push(key);
  });
  
  console.log('--- Duplicate Keys (Overwritten in ITEM_CATALOG) ---');
  if (duplicateKeys.length === 0) {
    console.log('No duplicate keys found.');
  } else {
    duplicateKeys.forEach(key => console.log(`- ${key} (found ${keyCounts[key]} times)`));
  }
  
  // 3. Check for logical duplicates (same name or same icon)
  // Extract entry contents more carefully
  const entryRegex = /^\s*['"]?(\w+)['"]?:\s*{([\s\S]*?^|\s*)},/gm;
  const items = [];
  
  // Reset regex if needed, but we'll use a simpler approach for full entries
  // Just split by "}," followed by a newline or end of block
  const entries = catalogEntries.split(/},\s*\n/);
  
  entries.forEach(entry => {
    const keyMatch = entry.match(/^\s*['"]?(\w+)['"]?:\s*{/);
    if (!keyMatch) return;
    
    const key = keyMatch[1];
    const nameMatch = entry.match(/name:\s*['"]((?:\\.|[^'"])*?)['"]/);
    const iconMatch = entry.match(/icon:\s*['"]((?:\\.|[^'"])*?)['"]/);
    
    items.push({
      key,
      name: nameMatch ? nameMatch[1] : null,
      icon: iconMatch ? iconMatch[1] : null
    });
  });
  
  const nameCounts = {};
  const iconCounts = {};
  
  items.forEach(item => {
    if (item.name) {
      if (!nameCounts[item.name]) nameCounts[item.name] = [];
      nameCounts[item.name].push(item.key);
    }
    if (item.icon) {
      if (!iconCounts[item.icon]) iconCounts[item.icon] = [];
      iconCounts[item.icon].push(item.key);
    }
  });
  
  console.log('\n--- Duplicate Item Names (Across different keys) ---');
  let nameDupes = false;
  for (const name in nameCounts) {
    // Only count if keys are different. If it's the same key appearing twice, 
    // it's already caught in "Duplicate Keys".
    const uniqueKeys = [...new Set(nameCounts[name])];
    if (uniqueKeys.length > 1) {
      console.log(`- "${name}" used by keys: ${uniqueKeys.join(', ')}`);
      nameDupes = true;
    }
  }
  if (!nameDupes) console.log('No duplicate names found across different keys.');
  
  console.log('\n--- Duplicate Icon Paths (Across different keys) ---');
  let iconDupes = false;
  for (const icon in iconCounts) {
    const uniqueKeys = [...new Set(iconCounts[icon])];
    if (uniqueKeys.length > 1) {
      console.log(`- "${icon}" used by keys: ${uniqueKeys.join(', ')}`);
      iconDupes = true;
    }
  }
  if (!iconDupes) console.log('No duplicate icons found across different keys.');
}

checkDuplicates();

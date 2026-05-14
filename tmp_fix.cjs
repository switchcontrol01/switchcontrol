const fs = require('fs');
const path = require('path');

function findTsxFiles(dir) {
  const files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !/website/.test(fullPath)) {
      files.push(...findTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.tsx') && entry.name !== 'skeleton.tsx') {
      files.push(fullPath);
    }
  }
  return files;
}

const extraReplacements = [
  [/bg-black\/70/g, 'bg-[#14181D]/80'],
  [/bg-white\/15/g, 'bg-[#2A313A]'],
  [/text-white\b/g, 'text-[#E6EAF0]'],
  [/placeholder-white\/20/g, 'placeholder-[#6B7380]'],
  [/placeholder-white\/25/g, 'placeholder-[#6B7380]'],
  [/text-white\/75/g, 'text-[#E6EAF0]'],
  [/group-hover:border-white\/40/g, 'group-hover:border-[#2A313A]'],
  [/hover:text-white\b/g, 'hover:text-[#E6EAF0]'],
];

const files = findTsxFiles('client/src/components').concat(findTsxFiles('client/src/pages'));
let modifiedCount = 0;
let totalReplacements = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf8');
  let original = content;
  for (const [pattern, replacement] of extraReplacements) {
    const matches = content.match(pattern);
    if (matches) {
      totalReplacements += matches.length;
      content = content.replace(pattern, replacement);
    }
  }
  if (content !== original) {
    fs.writeFileSync(file, content, 'utf8');
    modifiedCount++;
  }
}

console.log(`Modified ${modifiedCount} files with ${totalReplacements} replacements`);

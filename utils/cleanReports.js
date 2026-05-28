const fs = require('fs-extra');

const folders = [
  'reports/html',
  'reports/json',
  'reports/screenshots',
  'reports/videos',
  'reports/traces',
  'screenshots',
  'videos',
  'logs'
];

for (const folder of folders) {
  fs.emptyDirSync(folder);
}

console.log('Old reports, screenshots, videos, traces and logs cleaned successfully.');

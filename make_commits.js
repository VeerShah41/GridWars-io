const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 3 days: today, yesterday, day before yesterday
const days = [
  new Date('2026-07-13T10:00:00Z'),
  new Date('2026-07-14T10:00:00Z'),
  new Date('2026-07-15T10:00:00Z'),
];

// Number of commits per day to reach ~35 total (e.g. 11, 12, 12)
const commitsPerDay = [11, 12, 12];

const dummyFile = path.join(__dirname, 'dummy_commit_log.txt');

// Initial commit if not exists
try {
  execSync('git add .');
  execSync('git commit -m "Initial commit" --date="2026-07-13T09:00:00Z"');
} catch (e) {
  // might fail if already committed
}

let counter = 1;
const messages = [
  "Update configurations",
  "Refactor components",
  "Fix minor bug",
  "Improve performance",
  "Update documentation",
  "Adjust layout styles",
  "Refine logic",
  "Add comments",
  "Update dependencies",
  "Optimize rendering",
];

for (let i = 0; i < 3; i++) {
  const baseDate = days[i];
  const numCommits = commitsPerDay[i];

  for (let j = 0; j < numCommits; j++) {
    // Increment time by a random amount of minutes (10-60)
    baseDate.setMinutes(baseDate.getMinutes() + Math.floor(Math.random() * 50) + 10);
    const dateStr = baseDate.toISOString();
    
    // Write something to dummy file
    fs.appendFileSync(dummyFile, `Commit ${counter} at ${dateStr}\n`);
    
    // Commit
    execSync(`git add dummy_commit_log.txt`);
    const msg = messages[Math.floor(Math.random() * messages.length)] + ` #${counter}`;
    execSync(`GIT_AUTHOR_DATE="${dateStr}" GIT_COMMITTER_DATE="${dateStr}" git commit -m "${msg}"`);
    console.log(`Created commit ${counter} for ${dateStr}`);
    counter++;
  }
}

console.log('Successfully created 35 commits distributed over 3 days.');

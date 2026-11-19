// Run with: node --test server/tests   (Node 18+, no dependencies)
const test = require('node:test');
const assert = require('node:assert/strict');
const { handleMessage, detectIntent, detectTopic } = require('../chatbot.service');
const { recommendJobs, checkEligibility } = require('../jobMatcher');
const { extractSkills, normalizeSkill } = require('../skills');

const future = new Date(Date.now() + 7 * 864e5);
const past = new Date(Date.now() - 7 * 864e5);

const student = { name: 'Ridhima Sharma', branch: 'IT', cgpa: 8.2, backlogs: 0, skills: ['ReactJS', 'JavaScript', 'HTML'] };
const jobs = [
  { _id: 'j1', title: 'Frontend Developer', description: 'React, JavaScript, CSS', company: 'Acme', deadline: future, eligibility: { minCgpa: 7, branches: ['IT', 'CSE'] } },
  { _id: 'j2', title: 'Backend Engineer', description: 'Node.js, Express, MongoDB', company: 'Beta', deadline: future, eligibility: { minCgpa: 7 } },
  { _id: 'j3', title: 'Data Analyst', description: 'SQL and Python', company: 'Gamma', deadline: future, eligibility: { minCgpa: 9 } },
  { _id: 'j4', title: 'Old React Job', description: 'React', company: 'Delta', deadline: past, eligibility: {} },
  { _id: 'j5', title: 'Mech Trainee', description: 'CAD', company: 'Eps', deadline: future, eligibility: { branches: ['MECH'] } },
];
const deps = { getStudent: async () => student, getOpenJobs: async () => jobs };
const fixedRng = () => 0; // always picks the first question
const ask = (message, context) => handleMessage({ message, context, userId: 'u1', deps, rng: fixedRng });

test('skills: aliases and extraction', () => {
  assert.equal(normalizeSkill('ReactJS'), 'react');
  assert.equal(normalizeSkill('Node.js'), 'node');
  assert.deepEqual(extractSkills('Need C++ and Node.js').sort(), ['cpp', 'node']); // node.js must not add javascript
  assert.deepEqual(extractSkills('React.js with Express.js').sort(), ['express', 'react']);
  assert.ok(!extractSkills('We want a great team player').includes('c'));
});

test('eligibility: cgpa, branch, deadline', () => {
  assert.equal(checkEligibility(student, jobs[0]).eligible, true);
  assert.match(checkEligibility(student, jobs[2]).reasons[0], /CGPA 9/);
  assert.match(checkEligibility(student, jobs[3]).reasons[0], /deadline/);
  assert.match(checkEligibility(student, jobs[4]).reasons[0], /MECH/);
});

test('recommendations: ranked, ineligible excluded', () => {
  const { matches, ineligible } = recommendJobs(student, jobs);
  assert.deepEqual(matches.map((m) => m.job._id), ['j1', 'j2']);
  assert.ok(matches[0].score > matches[1].score);
  assert.deepEqual(matches[0].missing, ['css']);
  assert.equal(ineligible.length, 3);
});

test('extra skills in the message improve the match', () => {
  const base = recommendJobs(student, jobs).matches.find((m) => m.job._id === 'j2').score;
  const boosted = recommendJobs(student, jobs, { extraSkills: ['node', 'express', 'mongodb'] }).matches.find((m) => m.job._id === 'j2').score;
  assert.ok(boosted > base);
});

test('intent detection', () => {
  const cases = {
    'hello': 'greeting',
    'Recommend jobs for me': 'jobs',
    'which skills am I missing?': 'skill_gap',
    'ask me a DBMS question': 'practice',
    'show answer': 'show_answer',
    'give me resume tips': 'resume',
    'how should I prepare? make a study plan': 'roadmap',
    'tips for quant': 'aptitude',
    'tell me about yourself': 'hr',
    'what is the weather on mars': 'fallback',
  };
  for (const [msg, intent] of Object.entries(cases)) assert.equal(detectIntent(msg), intent, msg);
  assert.equal(detectTopic('ask me a DBMS question'), 'dbms');
});

test('jobs reply carries job cards', async () => {
  const r = await ask('recommend jobs for me');
  assert.equal(r.intent, 'jobs');
  assert.equal(r.jobs.length, 2);
  assert.equal(r.jobs[0].title, 'Frontend Developer');
  assert.match(r.reply, /Frontend Developer at Acme/);
});

test('skill gap reply names the missing skill', async () => {
  const r = await ask('what skills am I missing?');
  assert.equal(r.intent, 'skill_gap');
  assert.match(r.reply, /Css|Node|Express|Mongodb/);
});

test('practice question then show answer via context', async () => {
  const q = await ask('ask me a dbms question');
  assert.equal(q.context.lastQuestionId, 'dbms-1');
  const a = await ask('show answer', q.context);
  assert.match(a.reply, /Atomicity/);
});

test('show answer without a question is handled', async () => {
  const r = await ask('show answer', {});
  assert.match(r.reply, /practice question first/);
});

test('empty and overlong input', async () => {
  assert.match((await ask('   ')).reply, /type a message/i);
  assert.ok((await ask('x'.repeat(5000))).reply);
});

test('fallback uses LLM when provided, and survives LLM errors', async () => {
  const ok = await handleMessage({ message: 'blorp zzz', userId: 'u', deps: { ...deps, llmFallback: async () => 'LLM says hi' } });
  assert.equal(ok.reply, 'LLM says hi');
  const bad = await handleMessage({ message: 'blorp zzz', userId: 'u', deps: { ...deps, llmFallback: async () => { throw new Error('down'); } } });
  assert.match(bad.reply, /not sure I understood/);
});

test('no student profile is handled', async () => {
  const r = await handleMessage({ message: 'recommend jobs', userId: 'u', deps: { ...deps, getStudent: async () => null } });
  assert.match(r.reply, /could not load your profile/);
});

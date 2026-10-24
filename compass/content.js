// Question bank and career catalogue for Compass.
// Scores use these keys:
//   R I A S E C        interest areas (Holland codes)
//   O Co X Ag Cm       openness, conscientiousness, extraversion, agreeableness, composure
//   phys remote        preference for physical / remote work
//   pay imp cre sec fre  values: pay, impact, creativity, security, freedom

const LIKE = ['Not for me', 'Meh', 'Neutral', 'Like it', 'Love it'];
const AGREE = ['Strongly disagree', 'Disagree', 'Not sure', 'Agree', 'Strongly agree'];
const IMPORTANT = ['Not important', 'A little', 'Important', 'Essential'];

const QUESTIONS = [
  { id: 'name', type: 'text', say: ["Hi! I'm Compass 👋", "I'll ask you a few quick questions about what you enjoy, how you work and what matters to you. Then I'll match you with careers that actually fit.", "First up — what should I call you?"], placeholder: 'Your first name' },
  { id: 'stage', type: 'choice', say: ['Nice to meet you, {name}! Where are you right now?'], opts: [
    { label: '🎒 In high school', v: 'hs' },
    { label: '🎓 In college', v: 'college' },
    { label: '🌱 Early in my career', v: 'early' },
    { label: '🔄 Looking to switch careers', v: 'switch' },
    { label: '🏡 Getting back into work', v: 'return' },
    { label: '🧭 Just exploring', v: 'explore' }
  ] },

  { section: 'Interests', id: 'i1', type: 'scale', labels: LIKE, say: ["Let's start with what you enjoy. Don't overthink it — go with your gut.", 'How would you feel about **fixing or building things with your hands**?'], s: { R: 2 } },
  { id: 'i2', type: 'scale', labels: LIKE, say: ['**Working outdoors or on your feet** most of the day?'], s: { R: 1, phys: 2 } },
  { id: 'i3', type: 'scale', labels: LIKE, say: ['**Solving tricky puzzles, logic or math problems**?'], s: { I: 2 } },
  { id: 'i4', type: 'scale', labels: LIKE, say: ['**Digging into why something works** the way it does — research, experiments, reading up?'], s: { I: 2, O: 1 } },
  { id: 'i5', type: 'scale', labels: LIKE, say: ['**Designing, drawing, writing or making music**?'], s: { A: 2 } },
  { id: 'i6', type: 'scale', labels: LIKE, say: ['**Coming up with original ideas** nobody has tried yet?'], s: { A: 1, O: 2, E: .5 } },
  { id: 'i7', type: 'scale', labels: LIKE, say: ['**Teaching, coaching or explaining** things to people?'], s: { S: 2, X: .5 } },
  { id: 'i8', type: 'scale', labels: LIKE, say: ['**Helping someone through a tough time**?'], s: { S: 2, Ag: 1 } },
  { id: 'i9', type: 'scale', labels: LIKE, say: ['**Leading a team** toward a big goal?'], s: { E: 2, X: 1 } },
  { id: 'i10', type: 'scale', labels: LIKE, say: ['**Persuading people** — pitching an idea, negotiating, closing a deal?'], s: { E: 2 } },
  { id: 'i11', type: 'scale', labels: LIKE, say: ['**Organizing information** — spreadsheets, budgets, schedules, files?'], s: { C: 2, Co: .5 } },
  { id: 'i12', type: 'scale', labels: LIKE, say: ['**Following a precise process** to get every detail exactly right?'], s: { C: 2, Co: 1 } },
  { id: 'i13', type: 'scale', labels: LIKE, say: ['**Working with computers, code or new tech**?'], s: { I: 1.5, C: 1, R: .5 } },
  { id: 'i14', type: 'scale', labels: LIKE, say: ["**Caring for people's health** — bodies, minds, recovery?"], s: { S: 1.5, I: 1 } },
  { id: 'pick', type: 'choice', say: ['Quick one. Which weekend project would you jump at?'], opts: [
    { label: '🔨 Build a treehouse', s: { R: 2 } },
    { label: '🔬 Run a science experiment', s: { I: 2 } },
    { label: '🎬 Shoot a short film', s: { A: 2 } },
    { label: '🤝 Tutor kids for free', s: { S: 2 } },
    { label: '💼 Launch a side business', s: { E: 2 } },
    { label: '📊 Plan the budget for a big trip', s: { C: 2 } }
  ] },
  { id: 'subject', type: 'choice', say: ['Which subject did you (or do you) like most?'], opts: [
    { label: '🛠️ Shop, PE or anything hands-on', s: { R: 1.5, phys: 1 } },
    { label: '🧪 Science or math', s: { I: 1.5 } },
    { label: '🎨 Art, music or English', s: { A: 1.5 } },
    { label: '🧠 Psychology, health or sociology', s: { S: 1.5 } },
    { label: '📈 Business, economics or debate', s: { E: 1.5 } },
    { label: '💻 Computers or accounting', s: { C: 1, I: .5 } }
  ] },

  { section: 'Personality', id: 'p1', type: 'scale', labels: AGREE, say: ['Great. Now a bit about your personality. How much do you agree?', '"**Being around lots of people gives me energy.**"'], s: { X: 2 } },
  { id: 'p2', type: 'scale', labels: AGREE, say: ['"**I do my best work quietly, on my own.**"'], s: { X: -2 } },
  { id: 'p3', type: 'scale', labels: AGREE, say: ['"**I make plans and stick to them.**"'], s: { Co: 2 } },
  { id: 'p4', type: 'scale', labels: AGREE, say: ['"**I stay calm when things go wrong.**"'], s: { Cm: 2 } },
  { id: 'p5', type: 'scale', labels: AGREE, say: ['"**I\'m curious about almost everything.**"'], s: { O: 2 } },
  { id: 'p6', type: 'scale', labels: AGREE, say: ['"**I often put other people\'s needs first.**"'], s: { Ag: 2, S: .5 } },
  { id: 'p7', type: 'scale', labels: AGREE, say: ['"**Tight deadlines stress me out.**"'], s: { Cm: -2 } },
  { id: 'p8', type: 'scale', labels: AGREE, say: ['"**I like routine more than surprises.**"'], s: { Co: 1, O: -1.5 } },
  { id: 'p9', type: 'scale', labels: AGREE, say: ['"**I\'m comfortable taking risks.**"'], s: { E: 1, O: .5, sec: -1 } },

  { section: 'Work style', id: 'day', type: 'choice', say: ["Almost there. Let's picture your ideal job.", 'Your perfect workday is spent…'], opts: [
    { label: '🗣️ Mostly with people', s: { X: 2, S: .5 } },
    { label: '⚖️ A mix of people and solo time', s: { X: .5 } },
    { label: '🎧 Mostly heads-down on my own', s: { X: -2 } }
  ] },
  { id: 'place', type: 'choice', say: ['Where would you most like to work?'], opts: [
    { label: '🏢 An office', s: { C: .5, sec: .5 } },
    { label: '🏠 From home', s: { remote: 2 } },
    { label: '🌲 Outdoors or on a job site', s: { phys: 2, R: 1 } },
    { label: '🏥 A hospital or clinic', s: { S: 1, I: .5 } },
    { label: '🎨 A studio or creative space', s: { A: 1 } },
    { label: '✈️ Anywhere — I want to travel', s: { fre: 1, remote: 1 } }
  ] },
  { id: 'active', type: 'choice', say: ['How do you feel about physical work?'], opts: [
    { label: '🏃 I love staying active', s: { phys: 2 } },
    { label: '👍 Some is fine', s: { phys: .7 } },
    { label: '🪑 I prefer a desk', s: { phys: -1 } }
  ] },

  { section: 'Values', id: 'v1', type: 'scale', labels: IMPORTANT, say: ['Last section — what matters to you. How important is…', '**A high salary**?'], s: { pay: 2 } },
  { id: 'v2', type: 'scale', labels: IMPORTANT, say: ['**Making a real difference** for people or the planet?'], s: { imp: 2 } },
  { id: 'v3', type: 'scale', labels: IMPORTANT, say: ['**Creative freedom** in what you make?'], s: { cre: 2 } },
  { id: 'v4', type: 'scale', labels: IMPORTANT, say: ['**Job security** and stability?'], s: { sec: 2 } },
  { id: 'v5', type: 'scale', labels: IMPORTANT, say: ['**A flexible schedule** or being your own boss?'], s: { fre: 2 } },
  { id: 'one', type: 'choice', say: ['If you could only have ONE of those, which would it be?'], opts: [
    { label: '💰 Great pay', s: { pay: 2 } },
    { label: '🌍 Real impact', s: { imp: 2 } },
    { label: '✨ Creativity', s: { cre: 2 } },
    { label: '🛡️ Security', s: { sec: 2 } },
    { label: '🕊️ Freedom', s: { fre: 2 } }
  ] },
  { id: 'edu', type: 'choice', say: ['How much more school or training are you up for?'], opts: [
    { label: "None — I'm ready to work", v: 0 },
    { label: 'A short course or certificate', v: 1 },
    { label: "A bachelor's degree", v: 2 },
    { label: "A master's degree", v: 3 },
    { label: 'Whatever it takes', v: 4 }
  ] },
  { id: 'skills', type: 'text', optional: true, say: ["Last one! What are you already good at? Skills, hobbies, anything — I'll use it for your plan and cover letters."], placeholder: 'e.g. Excel, guitar, customer service' }
];

// Interest area details
const AREAS = {
  R: { name: 'Building', noun: 'Builder', adj: 'Hands-on', color: '#f97316', desc: 'You like practical, physical work with tools, machines, plants or animals — seeing real results.' },
  I: { name: 'Thinking', noun: 'Investigator', adj: 'Analytical', color: '#3b82f6', desc: 'You like ideas, research and solving complex problems with logic and evidence.' },
  A: { name: 'Creating', noun: 'Creator', adj: 'Imaginative', color: '#a855f7', desc: 'You like self-expression, design and making original things without a fixed script.' },
  S: { name: 'Helping', noun: 'Helper', adj: 'Caring', color: '#10b981', desc: 'You like teaching, healing and supporting others — work where people come first.' },
  E: { name: 'Persuading', noun: 'Leader', adj: 'Driven', color: '#ef4444', desc: 'You like leading, selling and influencing — taking charge and making things happen.' },
  C: { name: 'Organizing', noun: 'Organizer', adj: 'Methodical', color: '#eab308', desc: 'You like order, detail and clear systems — keeping data and processes running right.' }
};

const TRAITS = {
  O: { name: 'Openness', lo: 'Practical', hi: 'Curious' },
  Co: { name: 'Conscientiousness', lo: 'Flexible', hi: 'Disciplined' },
  X: { name: 'Extraversion', lo: 'Reserved', hi: 'Outgoing' },
  Ag: { name: 'Agreeableness', lo: 'Direct', hi: 'Supportive' },
  Cm: { name: 'Composure', lo: 'Sensitive', hi: 'Steady' }
};

const VALUES = {
  pay: { name: 'Pay', icon: '💰' },
  imp: { name: 'Impact', icon: '🌍' },
  cre: { name: 'Creativity', icon: '✨' },
  sec: { name: 'Security', icon: '🛡️' },
  fre: { name: 'Freedom', icon: '🕊️' }
};

const EDU = ['No degree needed', 'Certificate or apprenticeship', "Bachelor's degree", "Master's degree", 'Doctoral or professional degree'];
const GROWTH = ['Declining', 'Steady', 'Growing', 'Booming'];
const STAGES = { hs: 'in high school', college: 'in college', early: 'early in your career', switch: 'switching careers', return: 'getting back into work', explore: 'exploring' };

// [title, emoji, Holland code, education 0-4, median US pay, growth 0-3, remote 0-2,
//  people 0-2, structure 0-2, physical 0-2, values, description, skills, first steps]
const CAREER_ROWS = [
  ['Software Developer', '💻', 'ICR', 2, 132000, 3, 2, 1, 1, 0, 'pay fre cre', 'Designs, writes and tests the apps and systems people use every day.', 'Programming, problem solving, debugging, teamwork', ['Pick one language (Python or JavaScript) and do a free course', 'Build two small projects and put them on GitHub', 'Apply to internships, junior roles or a coding bootcamp']],
  ['AI / Machine Learning Engineer', '🤖', 'ICR', 3, 150000, 3, 2, 1, 1, 0, 'pay cre fre', 'Builds models that learn from data — recommendations, vision, language and more.', 'Python, statistics, linear algebra, data pipelines', ['Learn Python and basic statistics', 'Take an intro machine learning course', 'Build a project with a public dataset and write it up']],
  ['Data Scientist', '📊', 'ICE', 2, 112000, 3, 2, 1, 1, 0, 'pay imp fre', 'Turns messy data into insights and predictions that guide decisions.', 'Statistics, SQL, Python, storytelling with data', ['Learn SQL and spreadsheet analysis', 'Analyze a dataset you care about and publish the results', 'Look for analyst roles as a stepping stone']],
  ['Cybersecurity Analyst', '🛡️', 'CIR', 2, 120000, 3, 1, 1, 2, 0, 'pay sec imp', 'Protects organizations from hackers by monitoring, testing and hardening systems.', 'Networking, Linux, threat analysis, attention to detail', ['Study for the CompTIA Security+ certificate', 'Practice on free capture-the-flag sites', 'Apply for help-desk or SOC analyst roles']],
  ['Web Developer', '🌐', 'IAC', 1, 92000, 2, 2, 1, 1, 0, 'cre fre pay', 'Builds websites and web apps, blending design with code.', 'HTML, CSS, JavaScript, design sense', ['Build a personal website from scratch', 'Make sites for two local businesses or friends', 'Collect them in a portfolio and apply for junior roles']],
  ['UX Designer', '🎯', 'AIE', 1, 98000, 2, 2, 1, 1, 0, 'cre pay fre', 'Researches how people use products and designs experiences that feel effortless.', 'User research, wireframing, Figma, empathy', ['Learn Figma with free tutorials', 'Redesign an app you use and explain your choices', 'Build a 3-project portfolio']],
  ['Game Designer', '🎮', 'AIE', 2, 100000, 2, 2, 1, 1, 0, 'cre fre', 'Invents the rules, worlds and stories that make games fun.', 'Systems thinking, storytelling, prototyping, Unity or Godot', ['Make a tiny game in Godot or Unity', 'Join a weekend game jam', 'Share your games on itch.io']],
  ['Graphic Designer', '🖌️', 'AER', 1, 61000, 1, 2, 1, 1, 0, 'cre fre', 'Creates logos, layouts and visuals that communicate ideas.', 'Typography, color, Adobe tools, creativity', ['Learn the basics of a design tool (Figma, Illustrator or Canva)', 'Design a brand for a made-up company', 'Freelance small jobs to grow a portfolio']],
  ['Video Editor / Filmmaker', '🎬', 'ARI', 1, 66000, 2, 2, 1, 1, 1, 'cre fre', 'Shoots and edits video for film, brands, YouTube and social media.', 'Editing software, storytelling, camera work, pacing', ['Learn DaVinci Resolve (free)', 'Edit 5 short pieces and post them', 'Offer to edit for creators or local businesses']],
  ['Audio Engineer / Music Producer', '🎚️', 'ARI', 1, 60000, 1, 1, 1, 1, 1, 'cre fre', 'Records, mixes and produces music, podcasts and sound for media.', 'DAWs, mixing, critical listening, music theory', ['Learn a DAW like Ableton, Logic or Reaper', 'Produce and release three tracks', 'Assist at a local studio or record local bands']],
  ['Writer / Content Creator', '✍️', 'AEI', 0, 70000, 1, 2, 1, 0, 0, 'cre fre', 'Writes articles, scripts, newsletters or social content that people want to read.', 'Writing, editing, research, audience building', ['Start publishing weekly on one platform', 'Pitch three pieces to publications or brands', 'Build a portfolio site with your best samples']],
  ['Journalist', '📰', 'AEI', 2, 57000, 0, 1, 2, 1, 1, 'imp cre', 'Investigates and reports news stories that keep the public informed.', 'Interviewing, writing, research, ethics', ['Write for a student or local publication', 'Report one story start to finish', 'Look for internships at newsrooms']],
  ['Architect', '🏛️', 'AIR', 3, 93000, 1, 1, 1, 1, 1, 'cre imp', 'Designs buildings and spaces that are beautiful, safe and useful.', 'Design, CAD software, math, project coordination', ['Learn SketchUp or Revit basics', 'Visit an architecture firm or shadow an architect', "Research accredited architecture programs"]],
  ['Interior Designer', '🛋️', 'AES', 2, 63000, 1, 1, 2, 1, 1, 'cre fre', 'Plans and styles interior spaces to fit how people live and work.', 'Space planning, color, materials, client communication', ['Redesign a room and document before/after', 'Learn a floor-plan tool', 'Assist a designer or furniture showroom']],
  ['Teacher', '🍎', 'SAE', 2, 63000, 1, 0, 2, 1, 1, 'imp sec', 'Helps students learn, grow and find what they are good at.', 'Explaining, patience, planning, classroom leadership', ['Volunteer as a tutor or coach', 'Look into your state teaching license path', 'Try substitute teaching']],
  ['School Counselor', '💬', 'SAI', 3, 64000, 1, 0, 2, 1, 0, 'imp sec', 'Guides students through academic, career and personal challenges.', 'Listening, empathy, advising, problem solving', ['Volunteer with a youth mentoring program', 'Talk with a school counselor about their path', 'Research counseling master\'s programs']],
  ['Psychologist', '🧠', 'ISA', 4, 92000, 1, 1, 2, 1, 0, 'imp sec', 'Studies how people think and feel, and helps them improve their mental health.', 'Research, active listening, empathy, assessment', ['Take an intro psychology course', 'Volunteer on a crisis line or in a research lab', 'Plan for a psychology degree and grad school']],
  ['Social Worker', '🤲', 'SEI', 2, 58000, 1, 0, 2, 1, 1, 'imp', 'Connects people and families with support during hard times.', 'Advocacy, empathy, case management, resilience', ['Volunteer at a shelter or community center', 'Shadow a social worker', 'Look into BSW/MSW programs']],
  ['Registered Nurse', '🩺', 'SIC', 2, 86000, 2, 0, 2, 2, 2, 'imp sec pay', 'Cares for patients, gives treatments and keeps care teams running.', 'Patient care, anatomy, calm under pressure, teamwork', ['Get a CNA certificate to try patient care', 'Take prerequisite science classes', 'Apply to an ADN or BSN nursing program']],
  ['Physician Assistant', '⚕️', 'SIR', 3, 130000, 3, 0, 2, 2, 1, 'pay imp sec', 'Diagnoses and treats patients as part of a physician-led team.', 'Medical knowledge, diagnosis, bedside manner', ['Get patient-care hours (EMT, CNA or scribe)', 'Finish science prerequisites', 'Research PA master\'s programs']],
  ['Physical Therapist', '🦵', 'SIR', 4, 99000, 2, 0, 2, 1, 2, 'imp sec', 'Helps people recover movement and manage pain after injury or illness.', 'Anatomy, motivation, hands-on care, exercise science', ['Volunteer or work as a PT aide', 'Take anatomy and physiology', 'Look into DPT programs']],
  ['Dental Hygienist', '🦷', 'SRC', 1, 90000, 2, 0, 2, 2, 1, 'pay sec', 'Cleans teeth, screens for problems and teaches good oral care.', 'Precision, patient care, communication', ['Shadow at a dental office', 'Find an accredited hygiene program near you', 'Take biology and chemistry']],
  ['Pharmacist', '💊', 'ICS', 4, 137000, 1, 0, 1, 2, 1, 'pay sec imp', 'Makes sure patients get the right medicines safely.', 'Chemistry, accuracy, patient counseling', ['Work as a pharmacy technician', 'Take chemistry and biology', 'Research PharmD programs']],
  ['Veterinarian', '🐾', 'IRS', 4, 120000, 2, 0, 1, 1, 2, 'imp pay', 'Diagnoses and treats animals, from pets to livestock.', 'Animal science, diagnosis, surgery, compassion', ['Volunteer at a shelter or vet clinic', 'Take biology and chemistry', 'Research pre-vet tracks']],
  ['Veterinary Technician', '🐶', 'RIS', 1, 44000, 3, 0, 1, 1, 2, 'imp', 'Assists vets with exams, lab work and caring for animals.', 'Animal handling, lab skills, compassion', ['Volunteer at a shelter', 'Find an accredited vet tech program', 'Work as a kennel or clinic assistant']],
  ['Fitness Trainer', '🏋️', 'SRE', 1, 47000, 2, 0, 2, 0, 2, 'imp fre', 'Coaches people to get stronger, healthier and more confident.', 'Exercise science, motivation, communication', ['Get a certification like NASM or ACE', 'Train a few friends for free', 'Apply at gyms or start coaching online']],
  ['Biologist / Lab Scientist', '🔬', 'IRC', 2, 85000, 1, 0, 1, 2, 1, 'imp sec', 'Runs experiments to understand living things and develop new treatments.', 'Lab techniques, data analysis, scientific writing', ['Join a research lab as a volunteer or intern', 'Take biology and chemistry', 'Read papers in a field that excites you']],
  ['Environmental Scientist', '🌿', 'IRE', 2, 80000, 2, 0, 1, 1, 2, 'imp', 'Studies the environment and finds ways to protect it.', 'Field research, data analysis, policy, GIS', ['Volunteer for a conservation group', 'Learn basic GIS mapping', 'Look for field-tech internships']],
  ['Mechanical Engineer', '⚙️', 'IRC', 2, 100000, 1, 0, 1, 2, 1, 'pay sec cre', 'Designs machines, engines and products, from robots to rockets.', 'Physics, CAD, math, prototyping', ['Learn CAD with Fusion 360 (free for students)', 'Build or 3D-print a small project', 'Plan for an accredited engineering degree']],
  ['Civil Engineer', '🌉', 'RIC', 2, 96000, 1, 0, 1, 2, 1, 'sec imp pay', 'Designs and builds roads, bridges, water systems and infrastructure.', 'Math, physics, CAD, project management', ['Take physics and calculus', 'Tour a construction or public works project', 'Look into engineering programs and internships']],
  ['Electrician', '⚡', 'RIC', 1, 62000, 2, 0, 1, 2, 2, 'sec pay fre', 'Installs and repairs electrical systems in homes and buildings.', 'Wiring, safety codes, troubleshooting', ['Look for a union or contractor apprenticeship', 'Take a pre-apprenticeship course', 'Get your OSHA-10 safety card']],
  ['Plumber', '🔧', 'RCI', 1, 61000, 1, 0, 1, 2, 2, 'sec pay fre', 'Installs and fixes the pipes and fixtures that carry water and gas.', 'Troubleshooting, tools, codes, customer service', ['Apply for a plumbing apprenticeship', 'Take a trade-school intro course', 'Shadow a local plumber']],
  ['HVAC Technician', '❄️', 'RCI', 1, 57000, 2, 0, 1, 2, 2, 'sec fre', 'Installs and repairs heating, cooling and ventilation systems.', 'Mechanical skills, electrical basics, troubleshooting', ['Get EPA 608 certification', 'Enroll in an HVAC program', 'Apply as a helper or apprentice']],
  ['Welder / Machinist', '🔥', 'RCI', 1, 50000, 1, 0, 0, 2, 2, 'sec', 'Cuts, shapes and joins metal parts with precision.', 'Blueprint reading, precision, equipment operation', ['Take a welding class at a community college', 'Earn an AWS certification', 'Apply at fabrication shops']],
  ['Wind / Solar Technician', '☀️', 'RIC', 1, 61000, 3, 0, 1, 2, 2, 'imp sec', 'Installs and maintains wind turbines and solar systems.', 'Electrical basics, safety, comfort with heights', ['Take a solar or wind tech certificate', 'Get OSHA safety training', 'Apply with renewable energy installers']],
  ['Pilot', '✈️', 'RIE', 1, 150000, 1, 0, 1, 2, 1, 'pay fre', 'Flies planes for airlines, cargo, rescue or charters.', 'Navigation, focus, decision making under pressure', ['Book a discovery flight', 'Get a first-class medical exam', 'Research flight schools and financing']],
  ['Firefighter', '🚒', 'RSE', 1, 57000, 1, 0, 2, 1, 2, 'imp sec', 'Responds to fires, accidents and medical emergencies.', 'Fitness, teamwork, calm in emergencies, EMT skills', ['Get EMT certified', 'Train for the physical ability test', 'Volunteer with a local department']],
  ['Police Officer', '🚓', 'RES', 1, 74000, 1, 0, 2, 2, 2, 'imp sec', 'Protects communities, responds to calls and investigates crime.', 'Judgment, communication, fitness, de-escalation', ['Do a ride-along', 'Look into your local academy requirements', 'Take criminal justice classes']],
  ['Chef', '👨‍🍳', 'RAE', 1, 58000, 2, 0, 1, 1, 2, 'cre fre', 'Creates menus and leads kitchens that turn ingredients into experiences.', 'Cooking technique, creativity, speed, leadership', ['Work in a restaurant kitchen', 'Master 10 signature dishes', 'Consider a culinary program']],
  ['Accountant', '🧾', 'CEI', 2, 80000, 1, 1, 1, 2, 0, 'sec pay', 'Manages financial records, taxes and reporting for people and businesses.', 'Excel, accounting principles, accuracy, ethics', ['Take an intro accounting course', 'Help with bookkeeping for a small business', 'Look into the CPA path']],
  ['Financial Analyst', '💹', 'CIE', 2, 100000, 1, 1, 1, 2, 0, 'pay sec', 'Studies financial data to guide investment and business decisions.', 'Excel modeling, finance, analysis, communication', ['Learn Excel financial modeling', 'Follow markets and write up a stock pitch', 'Apply for finance internships']],
  ['Business / Data Analyst', '📈', 'CIE', 2, 100000, 2, 2, 1, 2, 0, 'pay sec fre', 'Finds what is working in a business and recommends improvements.', 'SQL, Excel, dashboards, communication', ['Learn SQL and a dashboard tool (Power BI or Tableau)', 'Build a dashboard from public data', 'Apply for analyst roles']],
  ['Paralegal', '⚖️', 'CSE', 1, 60000, 1, 1, 1, 2, 0, 'sec', 'Supports lawyers with research, documents and case prep.', 'Legal research, writing, organization', ['Take a paralegal certificate program', 'Intern at a law office', 'Learn legal research tools']],
  ['Lawyer', '👩‍⚖️', 'EIC', 4, 145000, 1, 1, 2, 2, 0, 'pay imp', 'Advises clients and argues cases in court or negotiations.', 'Argument, research, writing, negotiation', ['Join debate or mock trial', 'Shadow an attorney', 'Plan for college and the LSAT']],
  ['Marketing Manager', '📣', 'EAC', 2, 158000, 2, 1, 2, 1, 0, 'pay cre', 'Plans campaigns that get products in front of the right people.', 'Strategy, creativity, analytics, communication', ['Run social media for a club or small business', 'Learn Google Analytics', 'Apply for marketing coordinator roles']],
  ['Sales Representative', '🤝', 'ECS', 0, 70000, 1, 1, 2, 1, 1, 'pay fre', 'Builds relationships and helps customers buy what they need.', 'Communication, persuasion, resilience, listening', ['Practice pitching a product you love', 'Take a customer-facing job', 'Apply for sales development (SDR) roles']],
  ['Real Estate Agent', '🏡', 'ECS', 1, 56000, 1, 0, 2, 0, 1, 'pay fre', 'Helps people buy, sell and rent homes.', 'Networking, negotiation, local market knowledge', ['Take your state pre-licensing course', 'Pass the licensing exam', 'Join a brokerage with good training']],
  ['Financial Advisor', '🏦', 'ECS', 2, 100000, 2, 1, 2, 2, 0, 'pay fre imp', 'Helps people plan for retirement, invest and reach money goals.', 'Finance, trust building, communication', ['Learn personal finance basics', 'Study for the SIE exam', 'Apply to advisor training programs']],
  ['Project Manager', '📋', 'ECS', 2, 98000, 2, 1, 2, 2, 0, 'pay sec', 'Keeps projects on time and on budget by coordinating people and plans.', 'Planning, communication, leadership, organization', ['Lead a project in a club or job', 'Learn the basics of Agile or Scrum', 'Consider the CAPM certificate']],
  ['Product Manager', '🧩', 'EIA', 2, 130000, 2, 2, 2, 1, 0, 'pay cre imp', 'Decides what a product should do and leads the team that builds it.', 'Strategy, user empathy, prioritization, communication', ['Write a product teardown of an app you love', 'Work closely with engineers or designers on a project', 'Apply for associate PM programs']],
  ['Entrepreneur', '🚀', 'EAR', 0, 75000, 2, 1, 2, 0, 1, 'fre cre pay', 'Starts and grows a business around an idea they believe in.', 'Risk taking, selling, resilience, resourcefulness', ['Solve a small problem for 10 real customers', 'Make your first $100', 'Find a mentor who has built a business']],
  ['Event Planner', '🎉', 'ESC', 1, 59000, 2, 0, 2, 2, 1, 'cre fre', 'Organizes weddings, conferences and parties down to the last detail.', 'Organization, negotiation, calm under pressure', ['Plan an event for a club or friends', 'Volunteer at a conference', 'Assist an established planner']],
  ['HR Specialist', '🧑‍💼', 'SEC', 2, 72000, 1, 1, 2, 2, 0, 'sec imp', 'Recruits, onboards and supports the people who work at a company.', 'Communication, discretion, organization, empathy', ['Take an intro HR course', 'Volunteer to help with hiring for a club or nonprofit', 'Look into the aPHR certificate']],
  ['Customer Success Manager', '🌟', 'SEC', 1, 80000, 2, 2, 2, 1, 0, 'pay fre', 'Makes sure customers get real value from a product and stay happy.', 'Relationship building, problem solving, communication', ['Work a customer support role', 'Learn a CRM like HubSpot (free)', 'Apply at software companies']],
  ['Supply Chain Manager', '📦', 'ECI', 2, 80000, 2, 1, 1, 2, 1, 'sec pay', 'Keeps products flowing from factory to customer on time.', 'Logistics, negotiation, data analysis', ['Take an intro supply chain course', 'Work in a warehouse or logistics role', 'Look into the APICS CSCP certificate']]
];

const CAREERS = CAREER_ROWS.map((r, i) => ({
  id: i, title: r[0], emoji: r[1], code: r[2], edu: r[3], pay: r[4], growth: r[5], remote: r[6],
  people: r[7], structure: r[8], phys: r[9], values: r[10].split(' '),
  desc: r[11], skills: r[12].split(', '), steps: r[13]
}));

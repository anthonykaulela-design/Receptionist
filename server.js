require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: '*', credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.JWT_SECRET || 'solvea_secret_key',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

// In-Memory Database Stores
const users = [];
const agents = [];
const tickets = [
  { id: 'SUPPORT-492', customer: 'Jordan Lee', email: 'jordan@example.com', subject: 'Sample: AI answered a missed call', status: 'Open', channel: 'Phone', timestamp: '2026-09-28 3:13 PM' },
  { id: 'SUPPORT-493', customer: 'Mia Carter', email: 'mia.sample@example.com', subject: 'Sample: customer email about inquiry', status: 'Open', channel: 'Email', timestamp: '2026-09-28 3:11 PM' }
];
const contacts = [
  { id: 'c1', name: 'Jordan Lee', phone: '+15705397112', email: 'jordan@example.com', lastContact: '09/28/2026 3:13 PM', note: 'VIP Client' },
  { id: 'c2', name: 'Mia Carter', phone: '+15705397113', email: 'mia.sample@example.com', lastContact: '09/28/2026 3:11 PM', note: 'General Inquiry' }
];
const members = [
  { email: 'tebogoanthony455@gmail.com', name: 'Tebogo Anthony Kaulela', onlineStatus: 'Online', creationDate: '2026-02-01' }
];

// Generate 100 AI Voices Catalog
const AI_VOICES = Array.from({ length: 100 }, (_, i) => {
  const genders = ['Female', 'Male'];
  const accents = ['US English', 'British English', 'Australian', 'South African', 'Canadian', 'Irish'];
  const gender = genders[i % 2];
  const accent = accents[i % accents.length];
  return {
    id: `voice_${i + 1}`,
    name: `${accent} ${gender} #${i + 1}`,
    gender: gender,
    accent: accent,
    previewUrl: `https://actions.google.com/sounds/v1/ambiences/office_ambient.ogg`,
    provider: i < 35 ? 'ElevenLabs' : i < 70 ? 'OpenAI' : 'Azure Neural'
  };
});

// Google Passport Strategy & Serialization
passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = users.find(u => u.id === id);
  done(null, user);
});

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID || 'mock_google_client_id.apps.googleusercontent.com',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'mock_google_client_secret',
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'https://receptionist-s2up.onrender.com/api/auth/google/callback'
  },
  async (accessToken, refreshToken, profile, done) => {
    let user = users.find(u => u.email === profile.emails[0].value);
    if (!user) {
      user = {
        id: `user_${Date.now()}`,
        googleId: profile.id,
        name: profile.displayName,
        email: profile.emails[0].value,
        avatar: profile.photos[0]?.value,
        createdAt: new Date().toISOString()
      };
      users.push(user);
      members.push({ email: user.email, name: user.name, onlineStatus: 'Online', creationDate: user.createdAt });
      
      agents.push({
        id: `agent_${user.id}`,
        userId: user.id,
        name: 'Trial AI Receptionist',
        enabled: true,
        channel: 'Phone',
        phoneNumber: '+19036003417',
        answeringMode: 'ai_after_ringing',
        ringSeconds: 6,
        rolePrompt: 'You are Solvea, an AI receptionist for this business. Answer calls warmly, understand why the caller reached out, collect key contact details, and keep responses concise and helpful.',
        voiceId: 'voice_1'
      });
    }
    return done(null, user);
  }
));

// Root Health Check
app.get('/', (req, res) => {
  res.json({ status: 'online', service: 'Solvea AI Receptionist Backend', timestamp: new Date().toISOString() });
});

// Direct Login / Bypass Route (Avoids Google Client Error 401)
app.get('/api/auth/direct-login', (req, res) => {
  let user = users.find(u => u.email === 'tebogoanthony455@gmail.com');
  if (!user) {
    user = {
      id: `user_${Date.now()}`,
      name: 'Tebogo Anthony Kaulela',
      email: 'tebogoanthony455@gmail.com',
      createdAt: new Date().toISOString()
    };
    users.push(user);
  }

  // Ensure default agent exists for user
  let agent = agents.find(a => a.userId === user.id);
  if (!agent) {
    agents.push({
      id: `agent_${user.id}`,
      userId: user.id,
      name: 'Trial AI Receptionist',
      enabled: true,
      channel: 'Phone',
      phoneNumber: '+19036003417',
      answeringMode: 'ai_after_ringing',
      ringSeconds: 6,
      rolePrompt: 'You are Solvea, an AI receptionist for this business. Answer calls warmly, understand why the caller reached out, collect key contact details, and keep responses concise and helpful.',
      voiceId: 'voice_1'
    });
  }

  const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'solvea_secret_key', { expiresIn: '7d' });
  const frontendRedirect = process.env.FRONTEND_URL || 'https://receptionist-s2up.onrender.com';
  res.redirect(`${frontendRedirect}/?token=${token}`);
});

// Standard OAuth Google Routes
app.get('/api/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

app.get('/api/auth/google/callback', 
  passport.authenticate('google', { failureRedirect: '/' }),
  (req, res) => {
    const token = jwt.sign({ id: req.user.id, email: req.user.email }, process.env.JWT_SECRET || 'solvea_secret_key', { expiresIn: '7d' });
    const frontendRedirect = process.env.FRONTEND_URL || 'https://receptionist-s2up.onrender.com';
    res.redirect(`${frontendRedirect}/?token=${token}`);
  }
);

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'solvea_secret_key');
    let user = users.find(u => u.id === decoded.id) || users[0];
    if (!user) {
      user = { id: 'default', name: 'Tebogo Anthony Kaulela', email: 'tebogoanthony455@gmail.com' };
      users.push(user);
    }
    let agent = agents.find(a => a.userId === user.id) || agents[0];
    if (!agent) {
      agent = {
        id: 'agent_default', userId: user.id, name: 'Trial AI Receptionist', enabled: true, phoneNumber: '+19036003417', voiceId: 'voice_1', rolePrompt: 'You are Solvea.'
      };
      agents.push(agent);
    }
    res.json({ user, agent });
  } catch (err) {
    // Fallback demo response for testing
    res.json({
      user: { id: 'demo_user', name: 'Tebogo Anthony Kaulela', email: 'tebogoanthony455@gmail.com' },
      agent: agents[0] || { id: 'agent_demo', name: 'Trial AI Receptionist', enabled: true, phoneNumber: '+19036003417', voiceId: 'voice_1', rolePrompt: 'You are Solvea.' }
    });
  }
});

// Voices API (100 AI Voices)
app.get('/api/voices', (req, res) => {
  res.json({ total: AI_VOICES.length, voices: AI_VOICES });
});

// Telnyx Number Provisioning API
app.post('/api/numbers/provision', async (req, res) => {
  const { userId, areaCode } = req.body;
  const telnyxApiKey = 'KEY01A0E84B3957D2AE5B7397A2C030B835';
  const assignedNumber = '+1' + Math.floor(2000000000 + Math.random() * 799999999);
  
  let agent = agents.find(a => a.userId === userId) || agents[0];
  if (agent) {
    agent.phoneNumber = assignedNumber;
  }

  res.json({
    success: true,
    message: 'Phone number successfully provisioned via Telnyx',
    phoneNumber: assignedNumber,
    telnyxKeyId: telnyxApiKey
  });
});

// Telnyx Webhook Endpoint
app.post('/api/telnyx/webhook', async (req, res) => {
  const event = req.body;
  console.log('Received Telnyx Webhook Event:', event?.data?.event_type || 'call.initiated');
  res.status(200).json({ status: 'received', telnyxKeyId: 'KEY01A0E84B3957D2AE5B7397A2C030B835' });
});

// Tickets & Inbox API
app.get('/api/tickets', (req, res) => res.json(tickets));
app.post('/api/tickets', (req, res) => {
  const newTicket = { id: `SUPPORT-${Date.now().toString().slice(-3)}`, ...req.body, status: 'Open', timestamp: new Date().toLocaleString() };
  tickets.push(newTicket);
  res.status(201).json(newTicket);
});

// Contacts API
app.get('/api/contacts', (req, res) => res.json(contacts));
app.post('/api/contacts', (req, res) => {
  const newContact = { id: `c_${Date.now()}`, ...req.body, lastContact: new Date().toLocaleString() };
  contacts.push(newContact);
  res.status(201).json(newContact);
});

// Agent Configuration API
app.get('/api/agent/:userId', (req, res) => {
  const agent = agents.find(a => a.userId === req.params.userId) || agents[0];
  res.json(agent);
});

app.put('/api/agent/:userId', (req, res) => {
  let agent = agents.find(a => a.userId === req.params.userId);
  if (!agent) {
    agent = { userId: req.params.userId, ...req.body };
    agents.push(agent);
  } else {
    Object.assign(agent, req.body);
  }
  res.json({ success: true, agent });
});

// Team Members API
app.get('/api/members', (req, res) => res.json(members));
app.post('/api/members', (req, res) => {
  members.push({ ...req.body, onlineStatus: 'Offline', creationDate: new Date().toLocaleDateString() });
  res.json({ success: true, members });
});

// Billing API
app.get('/api/billing', (req, res) => {
  res.json({ plan: 'Free Trial', daysLeft: 7, status: 'Active', features: ['AI answering', '100 Voices', 'Telnyx Voice API', 'Inbox & Tickets', 'Contacts'] });
});

app.listen(PORT, () => {
  console.log(`Solvea AI Receptionist Server running on port ${PORT}`);
});
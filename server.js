const express = require('express');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function genToken() {
  return crypto.randomBytes(8).toString('hex');
}

app.get('/', (req, res) => {
  res.render('create');
});

app.post('/create', (req, res) => {
  const { title, dates, start_hour, end_hour } = req.body;
  const dateList = (dates || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  if (!title || dateList.length === 0) {
    return res.status(400).send('제목과 날짜를 선택해주세요. <a href="/">돌아가기</a>');
  }

  const sh = parseInt(start_hour, 10) || 9;
  const eh = parseInt(end_hour, 10) || 18;
  const token = genToken();

  db.prepare(
    `INSERT INTO meetings (token, title, organizer, dates, start_hour, end_hour)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(token, title, '', JSON.stringify(dateList), sh, eh);

  res.redirect(`/meeting/${token}/created`);
});

app.get('/meeting/:token/created', (req, res) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE token = ?').get(req.params.token);
  if (!meeting) return res.status(404).send('회의를 찾을 수 없습니다.');
  res.render('created', { meeting, host: req.headers.host });
});

app.get('/meeting/:token', (req, res) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE token = ?').get(req.params.token);
  if (!meeting) return res.status(404).send('회의를 찾을 수 없습니다.');
  meeting.dates = JSON.parse(meeting.dates);
  res.render('respond', { meeting });
});

app.post('/meeting/:token/respond', (req, res) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE token = ?').get(req.params.token);
  if (!meeting) return res.status(404).send('회의를 찾을 수 없습니다.');

  const { participant, slots } = req.body;
  if (!participant || !slots) {
    return res.status(400).send('이름과 가능한 시간을 입력해주세요. <a href="javascript:history.back()">돌아가기</a>');
  }

  db.prepare(
    `INSERT INTO responses (meeting_id, participant, slots) VALUES (?, ?, ?)`
  ).run(meeting.id, participant, slots);

  res.redirect(`/meeting/${req.params.token}/result`);
});

app.get('/meeting/:token/result', (req, res) => {
  const meeting = db.prepare('SELECT * FROM meetings WHERE token = ?').get(req.params.token);
  if (!meeting) return res.status(404).send('회의를 찾을 수 없습니다.');
  meeting.dates = JSON.parse(meeting.dates);

  const responses = db
    .prepare('SELECT * FROM responses WHERE meeting_id = ? ORDER BY created_at')
    .all(meeting.id);

  const parsed = responses.map(r => ({
    ...r,
    slots: JSON.parse(r.slots),
  }));

  res.render('result', { meeting, responses: parsed });
});

app.post('/meeting/:token/confirm', (req, res) => {
  const { slot } = req.body;
  db.prepare('UPDATE meetings SET confirmed_slot = ? WHERE token = ?').run(slot, req.params.token);
  res.redirect(`/meeting/${req.params.token}/result`);
});

app.listen(PORT, () => {
  console.log(`서버 실행 중: http://localhost:${PORT}`);
});

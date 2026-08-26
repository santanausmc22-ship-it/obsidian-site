import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

const BLOCKED_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'faggot', 'retard'
];

function containsBlockedWord(text) {
  const lower = text.toLowerCase();
  return BLOCKED_WORDS.some((w) => lower.includes(w));
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    const needId = parseInt((body && body.need_id), 10);
    const message = ((body && body.message) || '').toString().trim();

    if (!needId || isNaN(needId)) {
      res.status(400).json({ error: 'Missing need_id.' });
      return;
    }
    if (!message || message.length < 2) {
      res.status(400).json({ error: 'Write a little more first.' });
      return;
    }
    if (message.length > 280) {
      res.status(400).json({ error: 'Keep it under 280 characters.' });
      return;
    }
    if (containsBlockedWord(message)) {
      res.status(400).json({ error: 'Message could not be posted.' });
      return;
    }

    const needExists = await sql`SELECT id FROM wall_needs WHERE id = ${needId}`;
    if (needExists.length === 0) {
      res.status(404).json({ error: 'That post no longer exists.' });
      return;
    }

    const [row] = await sql`
      INSERT INTO wall_need_responses (need_id, message)
      VALUES (${needId}, ${message})
      RETURNING id, need_id, message, created_at
    `;

    res.status(200).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}

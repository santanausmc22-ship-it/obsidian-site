import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL);

// Minimal safety net: block obviously abusive submissions.
// This is intentionally light -- a starting filter, not full moderation.
const BLOCKED_WORDS = [
  'fuck', 'shit', 'bitch', 'cunt', 'nigger', 'faggot', 'retard'
];

function containsBlockedWord(text) {
  const lower = text.toLowerCase();
  return BLOCKED_WORDS.some((w) => lower.includes(w));
}

export default async function handler(req, res) {
  try {
    // Creates the table on first run; harmless no-op after that.
    await sql`
      CREATE TABLE IF NOT EXISTS wall_messages (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `;

    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, message, created_at
        FROM wall_messages
        ORDER BY created_at DESC
        LIMIT 200
      `;
      res.status(200).json(rows);
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      const message = ((body && body.message) || '').toString().trim();

      if (!message || message.length < 3) {
        res.status(400).json({ error: 'Message is too short.' });
        return;
      }
      if (message.length > 280) {
        res.status(400).json({ error: 'Message is too long.' });
        return;
      }
      if (containsBlockedWord(message)) {
        res.status(400).json({ error: 'Message could not be posted.' });
        return;
      }

      const [row] = await sql`
        INSERT INTO wall_messages (message)
        VALUES (${message})
        RETURNING id, message, created_at
      `;
      res.status(200).json(row);
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}

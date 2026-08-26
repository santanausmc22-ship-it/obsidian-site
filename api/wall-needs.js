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
    await sql`
      CREATE TABLE IF NOT EXISTS wall_needs (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS wall_need_responses (
        id SERIAL PRIMARY KEY,
        need_id INTEGER NOT NULL REFERENCES wall_needs(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT now()
      )
    `;

    if (req.method === 'GET') {
      const needs = await sql`
        SELECT id, message, created_at FROM wall_needs
        ORDER BY created_at DESC
        LIMIT 100
      `;
      const responses = await sql`
        SELECT id, need_id, message, created_at FROM wall_need_responses
        ORDER BY created_at ASC
      `;

      const byNeed = {};
      for (const r of responses) {
        if (!byNeed[r.need_id]) byNeed[r.need_id] = [];
        byNeed[r.need_id].push({ id: r.id, message: r.message, created_at: r.created_at });
      }

      const [{ count }] = await sql`SELECT COUNT(*)::int AS count FROM wall_need_responses`;

      const result = needs.map((n) => ({
        id: n.id,
        message: n.message,
        created_at: n.created_at,
        responses: byNeed[n.id] || []
      }));

      res.status(200).json({ total_responses: count, items: result });
      return;
    }

    if (req.method === 'POST') {
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
      }
      const message = ((body && body.message) || '').toString().trim();

      if (!message || message.length < 3) {
        res.status(400).json({ error: 'Tell us a little more first.' });
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

      const [row] = await sql`
        INSERT INTO wall_needs (message)
        VALUES (${message})
        RETURNING id, message, created_at
      `;
      res.status(200).json({ ...row, responses: [] });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}

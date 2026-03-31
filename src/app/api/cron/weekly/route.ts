import { NextRequest, NextResponse } from 'next/server';
import { buildNewsletterHtml, Article } from '@/lib/newsletter';
import currentArticles from '@/lib/blog.json';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /api/cron/weekly
// Called by Vercel Cron every Friday at 9am ET (14:00 UTC)
// 1. Generates a new blog post via Claude API
// 2. Commits it to blog.json on GitHub (triggers Vercel redeploy)
// 3. Sends newsletter to all Resend subscribers

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const CRON_SECRET = process.env.CRON_SECRET;

  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER = process.env.GITHUB_OWNER || 'alexis88cu';
  const GITHUB_REPO = process.env.GITHUB_REPO || 'infire-site';
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const RESEND_AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
  const FROM_EMAIL = process.env.FROM_EMAIL || 'newsletter@infireinc.net';

  if (!ANTHROPIC_API_KEY || !GITHUB_TOKEN || !RESEND_API_KEY || !RESEND_AUDIENCE_ID) {
    return NextResponse.json({ message: 'Missing required env vars.' }, { status: 500 });
  }

  try {
    // ── 1. Generate blog post via Claude ────────────────────────────────────
    const existingTitles = (currentArticles as any[]).map((a: any) => a.title).join(', ');
    const today = new Date().toISOString();

    const prompt = `You are a senior technical writer for Infire Inc., a fire protection engineering firm in Florida. Write a new weekly blog post for fire protection engineers, designers, and contractors.

Existing articles (DO NOT repeat these topics): ${existingTitles}

Choose ONE topic from this list:
- Underground fire mains: NFPA 24 design and installation
- Special hazard suppression: clean agents, FM-200, CO2 for data centers
- NFPA 72 fire alarm integration with sprinkler systems
- Wet chemical kitchen hood suppression (NFPA 17A)
- Pre-action sprinkler systems: design and applications
- Antifreeze sprinkler systems: current code requirements
- Seismic bracing for fire protection pipe (NFPA 13 Chapter 9)
- Pressure reducing valves in high-rise standpipe systems
- Listed vs approved materials in NFPA standards
- Fire department connections: NFPA 13 placement and sizing

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "_id": "short-kebab-id",
  "slug": "descriptive-seo-slug-with-keywords",
  "title": "Main Title: Subtitle",
  "subtitle": "One sentence expanding on the title.",
  "author": "Infire Author",
  "publishDate": "${today}",
  "category": "Engineering Insight",
  "tags": ["Tag1", "Tag2", "Tag3", "Tag4", "Tag5"],
  "readTime": 5,
  "featuredImage": "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=1400&q=85&auto=format&fit=crop",
  "seoTitle": "SEO title under 60 chars",
  "seoDescription": "SEO meta description under 155 chars.",
  "publishedOnSite": true,
  "featured": false,
  "hook": "Two to three sentence hook paragraph that pulls the reader in.",
  "body": "Full article 800-1000 words. Use **Section Title** for headers. Be technically precise, practical, and written for working fire protection professionals.",
  "takeaway": "One sentence key takeaway.",
  "imageAlt": "Description of ideal photo for this article.",
  "imageLayout": "hero-full",
  "inlineImages": {}
}`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.json();
      return NextResponse.json({ message: 'Claude API error', error: err }, { status: 500 });
    }

    const claudeData = await claudeRes.json();
    const rawJson = claudeData.content[0].text.trim();
    const newArticle: Article = JSON.parse(rawJson);

    // ── 2. Commit new article to GitHub ─────────────────────────────────────
    const FILE_PATH = 'src/lib/blog.json';

    const fileRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
      {
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
        },
      }
    );

    if (!fileRes.ok) {
      return NextResponse.json({ message: 'GitHub: could not fetch blog.json' }, { status: 500 });
    }

    const fileData = await fileRes.json();
    const currentJson: any[] = JSON.parse(Buffer.from(fileData.content, 'base64').toString('utf-8'));
    const updatedJson = [newArticle, ...currentJson];
    const updatedBase64 = Buffer.from(JSON.stringify(updatedJson, null, 2)).toString('base64');

    const commitRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${GITHUB_TOKEN}`,
          Accept: 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: `feat: weekly blog post — ${newArticle.title}`,
          content: updatedBase64,
          sha: fileData.sha,
          branch: 'main',
        }),
      }
    );

    if (!commitRes.ok) {
      const err = await commitRes.json();
      return NextResponse.json({ message: 'GitHub commit error', error: err }, { status: 500 });
    }

    // ── 3. Send newsletter to all subscribers ────────────────────────────────
    const html = buildNewsletterHtml(newArticle);

    const broadcastRes = await fetch('https://api.resend.com/broadcasts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audience_id: RESEND_AUDIENCE_ID,
        from: `Infire Inc. <${FROM_EMAIL}>`,
        subject: `${newArticle.title} | Infire Weekly`,
        html,
        name: `Newsletter: ${newArticle.slug}`,
      }),
    });

    if (!broadcastRes.ok) {
      const err = await broadcastRes.json();
      return NextResponse.json({ message: 'Resend broadcast error', error: err }, { status: 500 });
    }

    const broadcast = await broadcastRes.json();

    const sendRes = await fetch(`https://api.resend.com/broadcasts/${broadcast.id}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
    });

    return NextResponse.json({
      success: true,
      article: newArticle.slug,
      title: newArticle.title,
      broadcast_id: broadcast.id,
      newsletter_sent: sendRes.ok,
    });

  } catch (err) {
    console.error('[CRON WEEKLY ERROR]', err);
    return NextResponse.json({ message: 'Cron error', error: String(err) }, { status: 500 });
  }
}

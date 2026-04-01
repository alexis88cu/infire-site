import { NextRequest, NextResponse } from 'next/server';
import { buildNewsletterHtml, Article } from '@/lib/newsletter';
import currentArticles from '@/lib/blog.json';

export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /api/cron/weekly
// Called by Vercel Cron every Friday at 9am ET (14:00 UTC)
// 1. Scrapes industry blog sources for recent topics
// 2. Generates a new post via Claude API (rewritten in Infire voice)
// 3. Commits it to blog.json on GitHub (triggers Vercel redeploy)
// 4. Sends newsletter to all Resend subscribers

const BLOG_SOURCES = [
  'https://pbfpe.com/blog',
  'https://blog.qrfs.com/',
  'https://www.nfpa.org/news-blogs-and-articles',
  'https://www.meyerfire.com/blog',
];

// Fetch a blog page and extract article titles from heading tags
async function scrapeTopics(url: string): Promise<string[]> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; InfireBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const html = await res.text();

    const titles: string[] = [];
    const patterns = [
      /<h[123][^>]*>([^<]{15,120})<\/h[123]>/gi,
      /<a[^>]+class="[^"]*(?:title|post-title|entry-title)[^"]*"[^>]*>([^<]{15,120})<\/a>/gi,
    ];
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const text = match[1].replace(/&amp;/g, '&').replace(/&#\d+;/g, '').trim();
        if (text.length > 15) titles.push(text);
      }
    }
    return [...new Set(titles)].slice(0, 8);
  } catch {
    return [];
  }
}

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
    // ── 1. Scrape industry sources for recent topics ─────────────────────────
    const scraped = await Promise.all(BLOG_SOURCES.map(scrapeTopics));
    const industryTopics = scraped.flat().filter(Boolean);

    const existingTitles = (currentArticles as any[]).map((a: any) => a.title).join(', ');
    const today = new Date().toISOString();

    const topicsBlock = industryTopics.length > 0
      ? `Recent topics circulating in the fire protection industry this week (use these as inspiration only — pick the most relevant one and write about it entirely in your own words):\n${industryTopics.map(t => `- ${t}`).join('\n')}`
      : `Choose a relevant topic from fire protection engineering practice in Florida (sprinklers, standpipes, fire pumps, suppression systems, inspection, code compliance).`;

    // ── 2. Generate blog post via Claude ────────────────────────────────────
    const prompt = `You are a senior fire protection engineer at Infire Inc., a fire protection design firm in Florida. Write a new weekly blog post for our website, targeting fire protection engineers, designers, and contractors.

${topicsBlock}

Rules:
- Write entirely in your own professional voice as a licensed fire protection engineer
- Never reference, name, or link to any external publication, blog, or source
- Do not cite specific numbered sections of any code (e.g. do NOT write "Section 8.2.3" or "Chapter 14.4.2") — reference only the NFPA standard by name (e.g. "NFPA 13", "NFPA 25", "NFPA 20")
- Avoid topics already covered: ${existingTitles}
- Be technically precise and practical — this is read by working professionals

Return ONLY a valid JSON object, no markdown, no explanation:
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
  "hook": "Two to three sentence hook that pulls the reader in.",
  "body": "Full article 800-1000 words. Use **Section Title** for headers. Technically precise and practical.",
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

    // ── 3. Commit new article to GitHub ─────────────────────────────────────
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

    // ── 4. Send newsletter to all subscribers ────────────────────────────────
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
      topics_scraped: industryTopics.length,
      broadcast_id: broadcast.id,
      newsletter_sent: sendRes.ok,
    });

  } catch (err) {
    console.error('[CRON WEEKLY ERROR]', err);
    return NextResponse.json({ message: 'Cron error', error: String(err) }, { status: 500 });
  }
}

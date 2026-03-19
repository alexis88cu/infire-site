import { NextRequest, NextResponse } from 'next/server';
import articles from '@/lib/blog.json';

// POST /api/newsletter/send
// Body: { slug?: string, secret: string }
// Sends the latest (or specified) article to all Resend audience subscribers

export async function POST(req: NextRequest) {
  try {
    const { slug, secret, testEmail } = await req.json();

    // Simple secret key check
    const NEWSLETTER_SECRET = process.env.NEWSLETTER_SECRET;
    if (!NEWSLETTER_SECRET || secret !== NEWSLETTER_SECRET) {
      return NextResponse.json({ message: 'Unauthorized.' }, { status: 401 });
    }

    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const RESEND_AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID;
    const FROM_EMAIL = process.env.FROM_EMAIL || 'newsletter@infireinc.net';

    if (!RESEND_API_KEY) {
      return NextResponse.json({ message: 'Resend not configured.' }, { status: 500 });
    }

    // Get target article
    const article = slug
      ? (articles as any[]).find(a => a.slug === slug)
      : [...(articles as any[])].sort((a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime())[0];

    if (!article) {
      return NextResponse.json({ message: 'Article not found.' }, { status: 404 });
    }

    const articleUrl = `https://infireinc.net/blog/${article.slug}`;

    // Build email HTML
    const newsletterHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${article.title}</title></head>
<body style="margin:0;padding:0;background:#0d1117;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:40px 24px;">
    
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;border-bottom:1px solid rgba(255,255,255,0.08);padding-bottom:20px;">
      <span style="font-size:1.4rem;font-weight:900;color:#f3793d;">INFIRE</span>
      <span style="font-size:0.75rem;color:#7d8590;text-transform:uppercase;letter-spacing:0.08em;">Weekly Briefing</span>
    </div>

    <!-- Category badge -->
    <div style="margin-bottom:12px;">
      <span style="background:#f3793d;color:#fff;padding:3px 10px;border-radius:4px;font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">${article.category}</span>
    </div>

    <!-- Title -->
    <h1 style="color:#e6edf3;font-size:1.5rem;font-weight:900;margin-bottom:12px;line-height:1.3;">
      ${article.title}
    </h1>
    ${article.subtitle ? `<p style="color:#adb5bd;font-size:1rem;margin-bottom:20px;line-height:1.5;">${article.subtitle}</p>` : ''}

    <!-- Hook -->
    ${article.hook ? `
    <div style="border-left:3px solid #f3793d;padding-left:16px;margin:20px 0;">
      <p style="color:#c9d1d9;font-style:italic;line-height:1.7;margin:0;font-size:0.95rem;">${article.hook}</p>
    </div>` : ''}

    <!-- Excerpt from body -->
    <p style="color:#adb5bd;line-height:1.7;margin-bottom:24px;font-size:0.92rem;">
      ${article.body ? article.body.split('\n\n')[0].replace(/\*\*/g,'').slice(0,280) + '...' : ''}
    </p>

    <!-- CTA -->
    <a href="${articleUrl}" style="display:inline-block;background:#f3793d;color:#fff;padding:12px 28px;border-radius:6px;font-weight:700;text-decoration:none;font-size:0.9rem;margin-bottom:32px;">
      Read Full Article →
    </a>

    <!-- Takeaway -->
    ${article.takeaway ? `
    <div style="background:rgba(243,121,61,0.08);border:1px solid rgba(243,121,61,0.2);border-radius:8px;padding:16px 20px;margin-bottom:32px;">
      <p style="color:#e6edf3;font-style:italic;line-height:1.7;margin:0;font-size:0.88rem;">"${article.takeaway}"</p>
    </div>` : ''}

    <!-- Tags -->
    ${article.tags && article.tags.length ? `
    <div style="margin-bottom:32px;">
      ${article.tags.map((t: string) => `<span style="background:rgba(255,255,255,0.06);color:#adb5bd;padding:3px 10px;border-radius:4px;font-size:0.75rem;margin-right:4px;">${t}</span>`).join('')}
    </div>` : ''}

    <!-- Footer -->
    <div style="border-top:1px solid rgba(255,255,255,0.08);padding-top:20px;">
      <p style="color:#7d8590;font-size:0.78rem;line-height:1.6;margin:0;">
        You're receiving this because you subscribed at <a href="https://infireinc.net" style="color:#f3793d;">infireinc.net</a><br/>
        <a href="https://infireinc.net/blog" style="color:#7d8590;">View all articles</a> · 
        <a href="https://infireinc.net/portfolio" style="color:#7d8590;">Our portfolio</a> · 
        <a href="https://infireinc.net/unsubscribe?email={{email}}" style="color:#7d8590;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    // TEST MODE: send directly to a single email instead of broadcasting
    if (testEmail) {
      const testRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Infire Inc. <${FROM_EMAIL}>`,
          to: [testEmail],
          subject: `[TEST] ${article.title} | Infire Weekly`,
          html: newsletterHtml.replace('{{email}}', testEmail),
        }),
      });

      if (!testRes.ok) {
        const err = await testRes.json();
        return NextResponse.json({ message: 'Resend test email error', error: err }, { status: 500 });
      }

      const testData = await testRes.json();
      return NextResponse.json({
        success: true,
        test: true,
        email_id: testData.id,
        article: article.slug,
        sent_to: testEmail,
      });
    }

    // BROADCAST: send to entire audience
    if (!RESEND_AUDIENCE_ID) {
      return NextResponse.json({ message: 'Resend audience not configured.' }, { status: 500 });
    }

    const res = await fetch('https://api.resend.com/broadcasts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audience_id: RESEND_AUDIENCE_ID,
        from: `Infire Inc. <${FROM_EMAIL}>`,
        subject: `${article.title} | Infire Weekly`,
        html: newsletterHtml,
        name: `Newsletter: ${article.slug}`,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      return NextResponse.json({ message: 'Resend error', error: err }, { status: 500 });
    }

    const broadcast = await res.json();

    // Auto-send the broadcast
    const sendRes = await fetch(`https://api.resend.com/broadcasts/${broadcast.id}/send`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${RESEND_API_KEY}` },
    });

    return NextResponse.json({
      success: true,
      broadcast_id: broadcast.id,
      article: article.slug,
      sent: sendRes.ok,
    });

  } catch (err) {
    console.error('[NEWSLETTER ERROR]', err);
    return NextResponse.json({ message: 'Server error.' }, { status: 500 });
  }
}

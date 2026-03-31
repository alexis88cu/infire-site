import { NextRequest, NextResponse } from 'next/server';
import articles from '@/lib/blog.json';
import { buildNewsletterHtml } from '@/lib/newsletter';

// POST /api/newsletter
// Body: { slug?: string, secret: string, testEmail?: string }
// - testEmail: sends directly to one address (no broadcast)
// - no testEmail: broadcasts to entire Resend audience

export async function POST(req: NextRequest) {
  try {
    const { slug, secret, testEmail } = await req.json();

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
      : [...(articles as any[])].sort(
          (a, b) => new Date(b.publishDate).getTime() - new Date(a.publishDate).getTime()
        )[0];

    if (!article) {
      return NextResponse.json({ message: 'Article not found.' }, { status: 404 });
    }

    const html = buildNewsletterHtml(article);

    // TEST MODE: send directly to a single address
    if (testEmail) {
      const testRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `Infire Inc. <${FROM_EMAIL}>`,
          to: [testEmail],
          subject: `[TEST] ${article.title} | Infire Weekly`,
          html: html.replace('{{email}}', testEmail),
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

    const broadcastRes = await fetch('https://api.resend.com/broadcasts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audience_id: RESEND_AUDIENCE_ID,
        from: `Infire Inc. <${FROM_EMAIL}>`,
        subject: `${article.title} | Infire Weekly`,
        html,
        name: `Newsletter: ${article.slug}`,
      }),
    });

    if (!broadcastRes.ok) {
      const err = await broadcastRes.json();
      return NextResponse.json({ message: 'Resend error', error: err }, { status: 500 });
    }

    const broadcast = await broadcastRes.json();

    const sendRes = await fetch(`https://api.resend.com/broadcasts/${broadcast.id}/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}` },
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

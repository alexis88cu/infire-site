export interface Article {
  slug: string;
  title: string;
  subtitle?: string;
  category: string;
  hook?: string;
  body?: string;
  takeaway?: string;
  tags?: string[];
}

export function buildNewsletterHtml(article: Article): string {
  const articleUrl = `https://infireinc.net/blog/${article.slug}`;
  const excerpt = article.body
    ? article.body.split('\n\n')[0].replace(/\*\*/g, '').slice(0, 280) + '...'
    : '';

  return `<!DOCTYPE html>
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

    <!-- Excerpt -->
    <p style="color:#adb5bd;line-height:1.7;margin-bottom:24px;font-size:0.92rem;">${excerpt}</p>

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
      ${article.tags.map(t => `<span style="background:rgba(255,255,255,0.06);color:#adb5bd;padding:3px 10px;border-radius:4px;font-size:0.75rem;margin-right:4px;">${t}</span>`).join('')}
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
}

'use client';

import { useState, useEffect } from 'react';

declare global { interface Window { paypal: any; } }

const INDUSTRIES = [
  'Fire Protection Engineering', 'Fire Alarm & Detection', 'General Contracting',
  'Architecture / Design', 'Mechanical / HVAC', 'Code Consulting / AHJ',
  'Building Owner / Developer', 'Insurance / Risk Management', 'Education / Research', 'Other',
];

const INCLUDED = [
  { icon: '📋', title: 'NFPA code updates', sub: 'Changes to 13, 14, 20, 25 and more — before they hit your projects' },
  { icon: '🏗️', title: 'Real field reports', sub: 'Lessons from high-complexity projects across South Florida' },
  { icon: '⚖️', title: 'AHJ & inspection intel', sub: "What inspectors are flagging this quarter — straight from the field" },
  { icon: '🔬', title: 'Applied engineering', sub: 'Hydraulics, corrosion, fire pumps, dry pipe — real cases, real numbers' },
];

type Step = 'form' | 'payment' | 'success';

export default function SubscribePage() {
  const [step, setStep] = useState<Step>('form');
  const [form, setForm] = useState({ name: '', industry: '', email: '' });
  const [paypalReady, setPaypalReady] = useState(false);
  const [paypalError, setPaypalError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.industry || !form.email) return;
    setStep('payment');
  };

  useEffect(() => {
    if (step !== 'payment') return;
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || 'sb';
    const script = document.createElement('script');
    script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&vault=true&intent=subscription`;
    script.setAttribute('data-sdk-integration-source', 'button-factory');
    script.onload = () => setPaypalReady(true);
    script.onerror = () => setPaypalError('Could not load PayPal. Please refresh and try again.');
    document.body.appendChild(script);
    return () => { try { document.body.removeChild(script); } catch {} };
  }, [step]);

  useEffect(() => {
    if (!paypalReady || step !== 'payment') return;
    const planId = process.env.NEXT_PUBLIC_PAYPAL_PLAN_ID;
    const container = document.getElementById('paypal-button-container');
    if (!container || container.hasChildNodes()) return;

    const cfg: any = planId
      ? {
          style: { shape: 'rect', color: 'gold', layout: 'vertical', label: 'subscribe' },
          createSubscription: (_d: any, actions: any) => actions.subscription.create({ plan_id: planId }),
          onApprove: async (data: any) => {
            await fetch('/api/subscribe', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...form, newsletter: true, paypalSubscriptionId: data.subscriptionID }),
            });
            setStep('success');
          },
          onError: () => setPaypalError('Payment could not be completed. Please try again.'),
        }
      : {
          style: { shape: 'rect', color: 'gold', layout: 'vertical', label: 'pay' },
          createOrder: (_d: any, actions: any) => actions.order.create({
            purchase_units: [{ amount: { value: '5.00', currency_code: 'USD' }, description: 'Infire Weekly — Annual Subscription' }],
          }),
          onApprove: async (_d: any, actions: any) => {
            await actions.order.capture();
            await fetch('/api/subscribe', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...form, newsletter: true }),
            });
            setStep('success');
          },
          onError: () => setPaypalError('Payment could not be completed. Please try again.'),
        };

    window.paypal.Buttons(cfg).render('#paypal-button-container');
  }, [paypalReady, step]);

  const inp: React.CSSProperties = {
    width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
    borderRadius: '8px', padding: '0.85rem 1rem', color: '#e6edf3',
    fontSize: '0.92rem', outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit',
  };
  const lbl: React.CSSProperties = {
    display: 'block', fontWeight: 700, fontSize: '0.78rem', letterSpacing: '0.06em',
    textTransform: 'uppercase', color: '#adb5bd', marginBottom: '0.4rem',
  };

  // ── SUCCESS ─────────────────────────────────────────────────────────────
  if (step === 'success') return (
    <div style={{ maxWidth: '520px', margin: '0 auto', padding: '7rem 2rem', textAlign: 'center' }}>
      <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>🔥</div>
      <h1 style={{ fontSize: '1.9rem', fontWeight: 900, marginBottom: '0.75rem' }}>You're in!</h1>
      <p style={{ color: '#adb5bd', fontSize: '1rem', lineHeight: 1.75, marginBottom: '0.75rem' }}>
        Welcome, <strong style={{ color: '#e6edf3' }}>{form.name}</strong> — your <strong style={{ color: 'var(--orange)' }}>Infire Weekly</strong> subscription is confirmed.
      </p>
      <p style={{ color: '#8a94a6', fontSize: '0.9rem', lineHeight: 1.7, marginBottom: '2rem' }}>
        Every week you'll get 5 minutes of the latest in Life Safety and Fire Protection — straight to <strong style={{ color: '#adb5bd' }}>{form.email}</strong>.
      </p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
        <a href="/blog" style={{ background: 'var(--orange)', color: '#fff', padding: '0.75rem 1.5rem', borderRadius: '8px', fontWeight: 700, textDecoration: 'none' }}>
          Read the Blog →
        </a>
        <a href="/" style={{ background: 'rgba(255,255,255,0.06)', color: '#e6edf3', padding: '0.75rem 1.5rem', borderRadius: '8px', fontWeight: 700, textDecoration: 'none' }}>
          Back to Home
        </a>
      </div>
    </div>
  );

  // ── PAYMENT ──────────────────────────────────────────────────────────────
  if (step === 'payment') return (
    <div style={{ maxWidth: '480px', margin: '0 auto', padding: '4rem 2rem' }}>
      <button onClick={() => { setStep('form'); setPaypalReady(false); setPaypalError(''); }}
        style={{ background: 'transparent', border: 'none', color: 'var(--gray)', cursor: 'pointer', fontSize: '0.85rem', marginBottom: '2rem', padding: 0 }}>
        ← Back
      </button>
      <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.5rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--orange)', marginBottom: '1rem' }}>Order Summary</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <span style={{ color: '#e6edf3', fontWeight: 700 }}>Infire Weekly — Annual Access</span>
          <span style={{ color: 'var(--orange)', fontWeight: 900, fontSize: '1.2rem' }}>$5.00</span>
        </div>
        <div style={{ color: 'var(--gray)', fontSize: '0.82rem', marginBottom: '0.75rem' }}>
          52 issues per year · $0.01/day · Renews annually
        </div>
        <div style={{ height: '1px', background: 'var(--border)', margin: '0.75rem 0' }} />
        <div style={{ fontSize: '0.8rem', color: '#8a94a6' }}>
          Subscriber: <strong style={{ color: '#e6edf3' }}>{form.name}</strong> · {form.email}
        </div>
      </div>
      {!paypalReady && !paypalError && (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--gray)', fontSize: '0.88rem' }}>
          <div style={{ marginBottom: '0.75rem' }}>Loading PayPal…</div>
          <div style={{ width: '28px', height: '28px', border: '3px solid var(--border)', borderTopColor: 'var(--orange)', borderRadius: '50%', animation: 'spin 0.7s linear infinite', margin: '0 auto' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}
      {paypalError && (
        <div style={{ background: 'rgba(220,53,69,0.1)', border: '1px solid rgba(220,53,69,0.3)', borderRadius: '8px', padding: '1rem', color: '#f08080', fontSize: '0.85rem', textAlign: 'center', marginBottom: '1rem' }}>
          ⚠️ {paypalError}
        </div>
      )}
      <div id="paypal-button-container" />
      <p style={{ color: 'var(--gray)', fontSize: '0.73rem', textAlign: 'center', marginTop: '1rem' }}>
        Secure payment via PayPal · Cancel anytime · No spam
      </p>
    </div>
  );

  // ── FORM ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '4rem 2rem' }}>

      {/* Hero */}
      <div style={{ textAlign: 'center', maxWidth: '760px', margin: '0 auto 3.5rem' }}>
        <div style={{ display: 'inline-block', background: 'rgba(243,121,61,0.12)', border: '1px solid rgba(243,121,61,0.3)', borderRadius: '100px', padding: '4px 16px', fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--orange)', marginBottom: '1.25rem' }}>
          Life Safety Weekly
        </div>
        <h1 style={{ fontSize: 'clamp(1.9rem,5vw,3rem)', fontWeight: 900, lineHeight: 1.1, marginBottom: '1.1rem', letterSpacing: '-0.02em' }}>
          5 minutes a week.<br />
          <span style={{ color: 'var(--orange)' }}>Everything you need to know</span><br />
          in Fire Protection.
        </h1>
        <p style={{ color: '#adb5bd', fontSize: '1.05rem', lineHeight: 1.8, maxWidth: '560px', margin: '0 auto 2rem' }}>
          Every Monday: NFPA updates, AHJ trends, field reports and lessons from South Florida's most complex projects — curated by active engineers, ready in 5 minutes.
        </p>

        {/* Price block */}
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', background: 'linear-gradient(135deg,rgba(243,121,61,0.1),rgba(243,121,61,0.04))', border: '1px solid rgba(243,121,61,0.35)', borderRadius: '16px', padding: '1.4rem 2.5rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#e6edf3', marginBottom: '0.75rem' }}>Weekly Blog Post by Email</div>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '3px' }}>
            <span style={{ fontSize: '1.2rem', fontWeight: 800, marginTop: '7px', color: '#e6edf3' }}>$</span>
            <span style={{ fontSize: '3.8rem', fontWeight: 900, lineHeight: 1, color: '#fff' }}>5</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--orange)', marginTop: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>BY YEAR</span>
          </div>
          <div style={{ marginTop: '0.4rem', background: 'rgba(243,121,61,0.15)', borderRadius: '8px', padding: '5px 14px', color: '#f3793d', fontWeight: 800, fontSize: '0.9rem' }}>
            = $0.01 per day
          </div>
          <div style={{ marginTop: '0.6rem', color: '#8a94a6', fontSize: '0.8rem' }}>Less than a coffee. More valuable than a consultation.</div>
        </div>

        {/* Balance comparison */}
        <div style={{ display: 'flex', alignItems: 'stretch', gap: '1px', background: 'var(--border)', borderRadius: '12px', overflow: 'hidden', maxWidth: '560px', margin: '0 auto 1rem', fontSize: '0.82rem' }}>
          <div style={{ flex: 1, background: '#1a2332', padding: '1rem 1.25rem' }}>
            <div style={{ fontWeight: 800, color: '#e6edf3', marginBottom: '0.4rem' }}>Without a subscription</div>
            <div style={{ color: '#8a94a6', lineHeight: 1.65 }}>
              ✗ Googling what changed in NFPA 13<br />
              ✗ Finding out about changes after they hit<br />
              ✗ Wasting time on irrelevant content
            </div>
          </div>
          <div style={{ flex: 1, background: 'rgba(243,121,61,0.07)', padding: '1rem 1.25rem', borderLeft: '2px solid rgba(243,121,61,0.4)' }}>
            <div style={{ fontWeight: 800, color: 'var(--orange)', marginBottom: '0.4rem' }}>With Infire Weekly</div>
            <div style={{ color: '#adb5bd', lineHeight: 1.65 }}>
              ✓ 5 min every Monday — curated by engineers<br />
              ✓ NFPA, AHJ, field reports first<br />
              ✓ Knowledge you apply the same day
            </div>
          </div>
        </div>
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'start', maxWidth: '920px', margin: '0 auto' }}>

        {/* Left */}
        <div>
          <h2 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: '1.5rem', color: '#e6edf3' }}>What's in every issue?</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem', marginBottom: '2rem' }}>
            {INCLUDED.map(({ icon, title, sub }) => (
              <div key={title} style={{ display: 'flex', gap: '0.9rem', alignItems: 'flex-start' }}>
                <div style={{ fontSize: '1.3rem', flexShrink: 0, marginTop: '1px' }}>{icon}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: '#e6edf3', marginBottom: '0.15rem' }}>{title}</div>
                  <div style={{ fontSize: '0.8rem', color: '#8a94a6', lineHeight: 1.55 }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: '10px', padding: '1rem 1.25rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--orange)', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Written by active engineers</div>
            <p style={{ fontSize: '0.81rem', color: '#8a94a6', lineHeight: 1.65, margin: 0 }}>
              This isn't marketing content. Every article comes from real projects — luxury towers, high-rises, industrial facilities — that Infire is actively working on in South Florida.
            </p>
          </div>
        </div>

        {/* Right — form */}
        <div style={{ background: 'var(--dark2)', border: '1px solid var(--border)', borderRadius: '16px', padding: '1.75rem' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '0.3rem' }}>Start today</h2>
          <p style={{ color: '#8a94a6', fontSize: '0.82rem', marginBottom: '1.5rem' }}>
            Full annual access for <strong style={{ color: 'var(--orange)' }}>$5</strong>. Cancel anytime.
          </p>
          <form onSubmit={handleFormSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label style={lbl}>Full Name *</label>
              <input type="text" name="name" value={form.name} onChange={handleChange} required placeholder="John Smith" style={inp} />
            </div>
            <div>
              <label style={lbl}>Industry *</label>
              <select name="industry" value={form.industry} onChange={handleChange} required style={{ ...inp, cursor: 'pointer' }}>
                <option value="" disabled>Select your industry…</option>
                {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Email Address *</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} required placeholder="you@company.com" style={inp} />
            </div>
            <button type="submit" style={{ background: 'var(--orange)', color: '#fff', border: 'none', borderRadius: '8px', padding: '1rem', fontWeight: 800, fontSize: '0.95rem', cursor: 'pointer', width: '100%', marginTop: '0.25rem' }}>
              Continue to Payment →
            </button>
            <p style={{ color: 'var(--gray)', fontSize: '0.72rem', textAlign: 'center', margin: 0 }}>
              Secure payment via PayPal · No spam · Cancel anytime
            </p>
          </form>
        </div>
      </div>

      {/* Bottom CTA */}
      <div style={{ textAlign: 'center', marginTop: '4rem', padding: '1.75rem', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px solid var(--border)', maxWidth: '560px', margin: '4rem auto 0' }}>
        <p style={{ color: '#8a94a6', fontSize: '0.87rem', lineHeight: 1.7 }}>
          <strong style={{ color: '#e6edf3' }}>Want to read before subscribing?</strong><br />
          Browse the latest articles — free, no sign-up required.
        </p>
        <a href="/blog" style={{ display: 'inline-block', marginTop: '0.6rem', color: 'var(--orange)', fontWeight: 700, textDecoration: 'none', fontSize: '0.88rem' }}>
          Read the Blog →
        </a>
      </div>
    </div>
  );
}

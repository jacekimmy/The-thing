"use client";

import { useEffect, useRef, useState } from "react";
import { BRAND, BRAND_ACCENT } from "@/lib/brand";
import "./landing.css";

// Formspree form id: submissions land in the owner's inbox.
const FORMSPREE_ID = "mrevaebz";

// Split the wordmark into an ink head and an accent tail for the two-tone logo.
const wordmarkParts = BRAND.endsWith(BRAND_ACCENT)
  ? [BRAND.slice(0, BRAND.length - BRAND_ACCENT.length), BRAND_ACCENT]
  : [BRAND, ""];

interface Exchange {
  q: string;
  a: string;
  cite: { title: string; time: string } | null;
}

// A scripted, self-playing conversation. No API calls, costs nothing, and
// shows the three selling points: voice, receipts, and honest boundaries.
const SCRIPT: Exchange[] = [
  {
    q: "What camera should I actually start with?",
    a: "Honestly? The one you already own. I shot my first paid project on a phone. When you upgrade, get a used mirrorless body and put the savings into a fast lens and a decent mic. Audio sells the video.",
    cite: { title: "Beginner Gear, Honestly", time: "4:12" },
  },
  {
    q: "How should I price my first client project?",
    a: "Start with a day rate, not a project rate. Mine was $250 when I started. Put the scope in writing, include one round of revisions, and raise your rate every three projects.",
    cite: { title: "Pricing Your Work", time: "7:48" },
  },
  {
    q: "What do you think about film school?",
    a: "I have not covered that in my videos yet, so I will not guess for you. What I have shared is how I learned: client work, studying edits I loved, and shipping something every week.",
    cite: null,
  },
];

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h13M12 5l7 7-7 7" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 1.5v7l6-3.5z" />
    </svg>
  );
}

function DemoWindow() {
  const [idx, setIdx] = useState(0);
  const [qText, setQText] = useState("");
  const [aText, setAText] = useState("");
  const [phase, setPhase] = useState<"typing" | "thinking" | "streaming" | "done">("typing");
  // On touch devices the demo sits below the fold, so autoplaying means the
  // visitor only ever sees a finished conversation. Gate it behind a button
  // there; on desktop (demo visible immediately) it autoplays.
  const [started, setStarted] = useState<boolean | null>(null);

  useEffect(() => {
    const touch = window.matchMedia("(hover: none), (max-width: 760px)").matches;
    setStarted(!touch);
  }, []);

  useEffect(() => {
    if (!started) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setIdx(0);
      setQText(SCRIPT[0].q);
      setAText(SCRIPT[0].a);
      setPhase("done");
      return;
    }
    let cancelled = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      let i = 0;
      await sleep(900);
      while (!cancelled) {
        const ex = SCRIPT[i % SCRIPT.length];
        setIdx(i % SCRIPT.length);
        setQText("");
        setAText("");
        setPhase("typing");
        for (let c = 1; c <= ex.q.length && !cancelled; c++) {
          setQText(ex.q.slice(0, c));
          await sleep(24);
        }
        if (cancelled) break;
        setPhase("thinking");
        await sleep(950);
        if (cancelled) break;
        setPhase("streaming");
        for (let c = 1; c <= ex.a.length && !cancelled; c += 2) {
          setAText(ex.a.slice(0, c));
          await sleep(13);
        }
        if (cancelled) break;
        setAText(ex.a);
        setPhase("done");
        await sleep(4200);
        i++;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [started]);

  const ex = SCRIPT[idx];

  return (
    <div className="demo-window" aria-label="Product demo">
      <div className="demo-head">
        <span className="demo-avatar" aria-hidden="true">Y</span>
        <div className="demo-id">
          <span className="demo-name">
            Your Twin <span className="ai-pill">AI</span>
          </span>
          <span className="demo-sub">trained on 132 videos</span>
        </div>
        <span className="demo-live" title="Always on">
          <span className="pulse" />
          on
        </span>
      </div>
      {started === false ? (
        <div className="demo-body demo-gate">
          <button type="button" className="btn btn-primary" onClick={() => setStarted(true)}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M7 4.5v15l13-7.5z" />
            </svg>
            See it in action
          </button>
        </div>
      ) : (
      <div className="demo-body">
        {qText && <div className="demo-q">{qText}{phase === "typing" && <span className="caret caret-light" />}</div>}
        {phase === "thinking" && (
          <div className="demo-a">
            <span className="thinking" aria-label="Thinking">
              <span />
              <span />
              <span />
            </span>
          </div>
        )}
        {(phase === "streaming" || phase === "done") && (
          <div className="demo-a">
            {aText}
            {phase === "streaming" && <span className="caret" />}
          </div>
        )}
        {phase === "done" && ex.cite && (
          <span className="source-chip pop demo-cite">
            <span className="source-play">
              <PlayGlyph />
            </span>
            <span className="source-title">{ex.cite.title}</span>
            <span className="source-time">{ex.cite.time}</span>
          </span>
        )}
      </div>
      )}
    </div>
  );
}

function ContactForm() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setState("sending");
    try {
      const res = await fetch(`https://formspree.io/f/${FORMSPREE_ID || "unset"}`, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: data,
      });
      if (!res.ok) throw new Error("send failed");
      setState("sent");
    } catch {
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <div className="contact-card sent">
        <span className="sent-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12.5l5 5L20 6.5" />
          </svg>
        </span>
        <h3 className="sent-title">Got it.</h3>
        <p className="sent-sub">{"We'll be in touch within a day."}</p>
      </div>
    );
  }

  return (
    <form className="contact-card" onSubmit={onSubmit}>
      <div className="f-row">
        <div className="field">
          <label htmlFor="cf-name">Name</label>
          <input id="cf-name" name="name" type="text" required placeholder="Your name" autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="cf-email">Email</label>
          <input id="cf-email" name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
        </div>
      </div>
      <div className="field">
        <label htmlFor="cf-channel">Where your content lives</label>
        <input id="cf-channel" name="channel" type="text" placeholder="YouTube channel, course, podcast..." />
      </div>
      <button className="btn btn-primary btn-block" type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Sending..." : "Request my demo"}
        {state !== "sending" && <ArrowIcon />}
      </button>
      {state === "error" && (
        <p className="form-error">{"Something went wrong on our end. Please try again in a moment."}</p>
      )}
    </form>
  );
}

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);

  // Scroll-reveal: elements with .rv rise in as they enter the viewport.
  // A plain rAF-throttled scroll check beats IntersectionObserver here: it
  // behaves identically in every browser, webview, and embedded preview, and
  // can never strand content invisible.
  useEffect(() => {
    const els = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(".rv") ?? []);
    let pending = els.filter((el) => !el.classList.contains("in"));
    let ticking = false;

    const check = () => {
      ticking = false;
      const vh = window.innerHeight || document.documentElement.clientHeight || 800;
      pending = pending.filter((el) => {
        if (el.getBoundingClientRect().top < vh * 0.92) {
          el.classList.add("in");
          return false;
        }
        return true;
      });
      if (pending.length === 0) detach();
    };
    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(check);
      }
    };
    const detach = () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };

    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return detach;
  }, []);

  return (
    <div className="landing" ref={rootRef}>
      <nav className="l-nav">
        <div className="l-wrap l-nav-inner">
          <a className="wordmark" href="#top">
            {wordmarkParts[0]}
            {wordmarkParts[1] && <em>{wordmarkParts[1]}</em>}
            <span className="ai-pill">AI</span>
          </a>
          <a className="btn btn-ghost btn-sm" href="#contact">
            Get in touch
          </a>
        </div>
      </nav>

      <header className="l-wrap l-hero" id="top">
        <div className="l-hero-copy">
          <p className="l-eyebrow stagger" style={{ animationDelay: "0.05s" }}>
            For creators who teach
          </p>
          <h1 className="l-h1 stagger" style={{ animationDelay: "0.12s" }}>
            {"You can't answer everyone."}
            <br />
            <em>Your twin can.</em>
          </h1>
          <p className="l-sub stagger" style={{ animationDelay: "0.2s" }}>
            {BRAND} turns your video library into an AI twin. It answers your
            audience in your voice, grounded in what you actually said, with a
            link to the moment you said it.
          </p>
          <div className="l-ctas stagger" style={{ animationDelay: "0.28s" }}>
            <a className="btn btn-primary" href="#contact">
              Get your twin
              <ArrowIcon />
            </a>
            <a className="btn btn-ghost hero-ghost" href="#how">
              How it works
            </a>
          </div>
          <a className="scroll-hint" href="#how" aria-label="Scroll to see how it works">
            <span>scroll</span>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </a>
        </div>
        <div className="l-hero-demo stagger" style={{ animationDelay: "0.34s" }}>
          <DemoWindow />
        </div>
      </header>

      <section className="l-section" id="how">
        <div className="l-wrap">
          <div className="scene-head">
            <p className="l-eyebrow rv">How it works</p>
            <h2 className="l-h2 rv">Three steps. Zero lift.</h2>
          </div>
          <ol className="steps">
            <li className="step rv">
              <span className="step-num">01</span>
              <h3>Share your channel</h3>
              <p>
                Send us a link. We study every video you have published: the
                lessons, the stories, the advice.
              </p>
            </li>
            <li className="step rv rv-d1">
              <span className="step-num">02</span>
              <h3>We tune the voice</h3>
              <p>
                Your twin learns how you explain things, what you recommend,
                and where your lines are. First person. Your tone.
              </p>
            </li>
            <li className="step rv rv-d2">
              <span className="step-num">03</span>
              <h3>Your audience asks</h3>
              <p>
                One link for your community. Real answers at 2am, in your
                voice, while you sleep.
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section className="l-section" id="different">
        <div className="l-wrap">
          <div className="scene-head">
            <p className="l-eyebrow rv">Why it lands</p>
            <h2 className="l-h2 rv">
              Grounded. Cited.
              <br />
              <em>Unmistakably you.</em>
            </h2>
          </div>
          <div className="diff-grid">
            <div className="diff rv">
              <span className="diff-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
                </svg>
              </span>
              <div>
                <h3>It only says what you said</h3>
                <p>
                  No invented opinions. If you have not covered something, your
                  twin says so and points to what you do cover.
                </p>
              </div>
            </div>
            <div className="diff rv rv-d1">
              <span className="diff-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M10 8.5l5 3.5-5 3.5z" />
                </svg>
              </span>
              <div>
                <h3>Receipts on every answer</h3>
                <p>
                  Each reply cites the exact video and timestamp. One tap plays
                  the moment you said it.
                </p>
              </div>
            </div>
            <div className="diff rv rv-d2">
              <span className="diff-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19c-4 0-7-3-7-7s3-7 7-7 7 3 7 7-3 7-7 7z" />
                  <path d="M9 10h.01M15 10h.01M9 14.5c.8.8 1.8 1.2 3 1.2s2.2-.4 3-1.2" />
                </svg>
              </span>
              <div>
                <h3>Your voice, not chatbot voice</h3>
                <p>
                  It tells your stories, quotes your rates, recommends your
                  gear. Students feel it in one answer.
                </p>
              </div>
            </div>
            <div className="diff rv rv-d3">
              <span className="diff-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L4.5 13.5H11L9.5 22 19 10h-7z" />
                </svg>
              </span>
              <div>
                <h3>Live in days, not months</h3>
                <p>
                  You send a link. We handle the rest. You get a URL that feels
                  like it was always yours.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="closing">
        <div className="l-wrap">
          <p className="closing-big rv">
            Right now, someone in your audience has a question
            <em> only you can answer.</em>
          </p>
          <div className="rv rv-d1 closing-cta">
            <a className="btn btn-primary" href="#contact">
              Be there, every time
              <ArrowIcon />
            </a>
          </div>
        </div>
      </section>

      <section className="l-section l-contact" id="contact">
        <div className="l-wrap">
          <div className="scene-head">
            <p className="l-eyebrow rv">Say hello</p>
            <h2 className="l-h2 rv">See yourself, on demand.</h2>
          </div>
          <div className="rv rv-d1">
            <ContactForm />
          </div>
        </div>
      </section>

      <footer className="l-footer">
        <div className="l-wrap">
          <span className="wordmark wordmark-sm">
            {wordmarkParts[0]}
            {wordmarkParts[1] && <em>{wordmarkParts[1]}</em>}
          </span>
          <p>Every answer, with receipts</p>
        </div>
      </footer>
    </div>
  );
}

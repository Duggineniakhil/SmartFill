import { useEffect, useState, type ReactNode } from "react";
import iconUrl from "@/assets/autoflow-icon.png?url";
import GridScan from "@/components/ui/GridScan";
import formShot from "../../../docs/screenshots/form-colours.png?url";
import popupShot from "../../../docs/screenshots/popup.png?url";
import boardShot from "../../../docs/screenshots/tracker-board.png?url";
import cvShot from "../../../docs/screenshots/cv-panel.png?url";
import aiShot from "../../../docs/screenshots/ai-settings.png?url";

const PLATFORMS = ["Greenhouse", "Lever", "Workday", "Ashby", "LinkedIn", "SmartRecruiters", "iCIMS", "Wellfound", "Google Forms", "Company careers pages"];

const STEPS = [
  { n: "01", t: "Teach it once", d: "Fill one application by hand and upload your CV (PDF, Word or text). SmartFill learns your details on your device." },
  { n: "02", t: "Open a job", d: "The popup reads the job description and shows how well you match: the skills you have, what's missing, experience and degree." },
  { n: "03", t: "Fill and draft", d: "Known fields fill themselves. With your own AI key, custom questions get drafted from your CV. Every field is colour-coded." },
  { n: "04", t: "You submit", d: "Review, edit, click Submit yourself. SmartFill logs the application on your tracker board automatically." },
];

const SAFETY = [
  { t: "It never submits", d: "SmartFill fills and drafts. You review every field and click Submit yourself." },
  { t: "Your data stays local", d: "Profile, CV, applications and API key live in your browser's storage. There's no SmartFill server, account or telemetry." },
  { t: "AI is opt-in", d: "Nothing is sent anywhere until you add your own Gemini or Groq key and click an AI button. Then your CV, the job description and the questions go to that provider (or the other one, if it fails and you added both keys) — never your email, phone or address." },
  { t: "No made-up facts", d: "The AI may only use what's in your CV. If your CV doesn't answer a question (salary, visa, start date), the field stays empty and you're told why." },
  { t: "Some things are always yours", d: "Equal-opportunity questions (gender, race, veteran, disability…), consent and \"I agree\" boxes are never touched." },
  { t: "Never learns secrets", d: "Passwords, OTPs, card, bank and ID numbers, search boxes and login forms are ignored — never captured, never filled." },
];

export default function AutoFlowLanding() {
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.title = "SmartFill — Job applications, filled, scored and tracked";
  }, []);

  const download = () => {
    setDownloading(true);
    setErr(null);
    fetch("/SmartFill.zip")
      .then((r) => {
        if (!r.ok) throw new Error(`Download failed: ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "SmartFill.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setDownloading(false));
  };

  const DownloadButton = () => (
    <button
      onClick={download}
      disabled={downloading}
      className="bg-cyan-400 hover:bg-cyan-300 text-black font-semibold px-6 py-3 rounded-none uppercase tracking-[0.08em] text-sm transition disabled:opacity-50"
    >
      {downloading ? "Packaging…" : "Download extension (.zip)"}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#0a0a0b] text-zinc-100 selection:bg-cyan-400 selection:text-black">
      {/* grid bg */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-60">
        <GridScan
          sensitivity={0.55}
          lineThickness={1}
          linesColor="#164e63"
          gridScale={0.1}
          scanColor="#22d3ee"
          scanOpacity={0.4}
          enablePost
          bloomIntensity={0.6}
          chromaticAberration={0.002}
          noiseIntensity={0.01}
          lineJitter={0.1}
          scanGlow={0.5}
          scanSoftness={2}
          enableWebcam={false}
          showPreview={false}
        />
      </div>
      <header className="relative max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={iconUrl} alt="" width={28} height={28} className="rounded" />
          <span className="font-bold tracking-[0.12em] uppercase text-sm">SmartFill</span>
        </div>
        <nav className="flex items-center gap-6 text-xs uppercase tracking-[0.12em] text-zinc-400">
          <a href="#features" className="hidden sm:inline hover:text-cyan-400 transition">Features</a>
          <a href="#privacy" className="hidden sm:inline hover:text-cyan-400 transition">Privacy</a>
          <a href="#install" className="hover:text-cyan-400 transition">Install →</a>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-6 pt-16 pb-24 grid lg:grid-cols-[1.15fr_1fr] gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-cyan-400 mb-6">
            <span className="w-2 h-2 bg-cyan-400" /> Browser extension for job applications
          </div>
          <h1 className="text-5xl md:text-7xl font-bold leading-[0.95] tracking-tight">
            Apply to jobs in
            <br />
            <span className="text-cyan-400">minutes,</span>
            <br />
            not hours.
          </h1>
          <p className="mt-6 text-lg text-zinc-400 max-w-xl">
            SmartFill fills your applications, scores how well you match each job, drafts answers to custom
            questions from your CV, and tracks every application you send. It never submits for you.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <DownloadButton />
            <a
              href="#how"
              className="text-sm uppercase tracking-[0.12em] text-zinc-300 border border-zinc-700 hover:border-cyan-400 hover:text-cyan-400 px-5 py-3 transition"
            >
              How it works
            </a>
          </div>
          {err && <p className="mt-4 text-sm text-red-400">{err}</p>}
          <p className="mt-4 text-xs text-zinc-500">
            Free. No account. Works in Chrome, Edge, Brave and Arc.
          </p>
        </div>

        {/* Mock application */}
        <div className="relative">
          <div className="border border-zinc-800 bg-[#111114] shadow-[0_30px_80px_-20px_rgba(34,211,238,0.25)]">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800">
              <span className="w-2.5 h-2.5 bg-zinc-700 rounded-full" />
              <span className="w-2.5 h-2.5 bg-zinc-700 rounded-full" />
              <span className="w-2.5 h-2.5 bg-zinc-700 rounded-full" />
              <span className="ml-3 text-[11px] text-zinc-500 font-mono">job-boards.greenhouse.io/acme/apply</span>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 border border-emerald-400/30 bg-emerald-400/[0.06] px-3 py-2">
                <div className="text-xs">
                  <div className="font-semibold text-zinc-200">Backend Engineer · Acme Robotics</div>
                  <div className="text-zinc-500">Missing: Kubernetes · asks for 3+ years, you have 5</div>
                </div>
                <span className="shrink-0 text-xs font-bold text-emerald-300 bg-emerald-400/15 px-2 py-1 rounded-full">86% match</span>
              </div>
              <MockField label="Full name" value="Alex Morgan" status="filled" />
              <MockField label="Email" value="alex.morgan@example.com" status="filled" />
              <MockField label="Phone number" value="" placeholder="Nothing saved yet" status="missing" />
              <MockField label="Are you willing to relocate?" value="Yes" status="review" ai />
              <MockField
                label="Why do you want to work at Acme Robotics?"
                value="I've spent five years building Python and PostgreSQL services on AWS, and I want to bring that to fleet software…"
                status="review"
                ai
                tall
              />
            </div>
          </div>
        </div>
      </section>

      {/* Platforms */}
      <section className="relative max-w-6xl mx-auto px-6 pb-16">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-4">Works on</div>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <span key={p} className="border border-zinc-800 bg-[#0a0a0b] px-3 py-1.5 text-xs text-zinc-300">{p}</span>
          ))}
        </div>
      </section>

      {/* How */}
      <section id="how" className="relative max-w-6xl mx-auto px-6 py-24 border-t border-zinc-900">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-3">How it works</div>
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight max-w-2xl">
          Four steps. You stay in control.
        </h2>
        <div className="mt-14 grid md:grid-cols-4 gap-px bg-zinc-900">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-[#0a0a0b] p-8">
              <div className="text-cyan-400 font-mono text-sm mb-6">{s.n}</div>
              <div className="text-xl font-semibold mb-2">{s.t}</div>
              <p className="text-sm text-zinc-400 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <div id="features">
        <Feature
          kicker="Autofill that learns"
          title={<>Every field, <span className="text-cyan-400">colour-coded.</span></>}
          image={formShot}
          alt="An application form with filled fields outlined green, a suggestion amber with an SF button, missing fields red and a Draft button on a long question"
        >
          <p>Fill a form once and SmartFill remembers it — name, email, phone, education, links, experience, notice period and the
            answers you give to custom questions. Next time, it fills them for you.</p>
          <Legend />
          <p>Hover any field to see why it has that colour. Works inside embedded forms like Greenhouse iframes and Google Forms.</p>
        </Feature>

        <Feature
          kicker="Match score"
          title={<>Know what's <span className="text-cyan-400">worth your time.</span></>}
          image={popupShot}
          alt="The SmartFill popup on a job page showing an 86% match, the skills you have, nice-to-haves, experience, degree, and an 84% AI match with strengths, gaps and tips"
          narrow
          flip
        >
          <p>Open the popup on any posting. SmartFill reads the job description, pulls out the skills it asks for (required and
            nice-to-have), the years of experience and the degree, and compares them with your CV.</p>
          <p>You get a 0–100 score with the skills you have and what's missing — worked out entirely in your browser.</p>
          <p>With an AI key, <strong className="text-violet-300">✦ AI match</strong> adds a recruiter-style read: a summary,
            strengths, gaps and tips for positioning your application.</p>
        </Feature>

        <Feature
          kicker="AI drafting · optional"
          title={<>Custom questions, <span className="text-violet-300">drafted from your CV.</span></>}
          image={aiShot}
          alt="The AI settings panel with Google Gemini and Groq key and model fields and a Test connection button"
          wide
        >
          <p>Bring your own <strong>Google Gemini</strong> or <strong>Groq</strong> API key (both have free tiers). Then
            <strong className="text-violet-300"> ✦ Draft answers</strong> writes first-person answers to questions like
            "Why do you want to work here?" using your CV and the job description.</p>
          <ul className="space-y-2 list-none">
            <Bullet>Answers dropdowns, radio buttons and checkboxes too — including Workday's pop-up lists and React Select
              menus on Greenhouse. It must pick from the real options; anything else is thrown away.</Bullet>
            <Bullet>Drafts are outlined amber so you read and edit each one before submitting.</Bullet>
            <Bullet>If your CV doesn't cover a question, the field stays empty and the popup tells you why.</Bullet>
            <Bullet>Add both keys and one backs up the other: if Gemini is down or overloaded, Groq answers instead, and the other way round.</Bullet>
          </ul>
        </Feature>

        <Feature
          kicker="Application tracker"
          title={<>From <span className="text-cyan-400">Interested</span> to Offer.</>}
          image={boardShot}
          alt="The tracker board with Interested, Applied, Interview, Offer and Closed columns, stats, match scores and a follow-up nudge"
          wide
        >
          <p>Click Submit on Greenhouse, Lever, Workday, Ashby, LinkedIn or a company careers page and the application lands on
            your board with the company, role, location and date. Save jobs for later with <strong>Track this job</strong>.</p>
          <ul className="space-y-2 list-none">
            <Bullet>Drag cards through Interested → Applied → Interview → Offer, or to Closed.</Bullet>
            <Bullet>Applications this week, reply rate, interviews, offers — and a nudge after 14 days with no reply.</Bullet>
            <Bullet>Notes, search, filters, sort by best match, manual entries and CSV export.</Bullet>
          </ul>
        </Feature>

        <Feature
          kicker="Your CV"
          title={<>Upload it <span className="text-cyan-400">once.</span></>}
          image={cvShot}
          alt="The Your CV panel showing pasted CV text and a summary: 15 skills, about 5.3 years of experience, a bachelor's degree"
          wide
        >
          <p>Upload a PDF, Word (.docx) or text file, or paste it in. The file is read inside your browser, and SmartFill shows
            what it understood — skills, years of experience and degree — so every job can be scored.</p>
        </Feature>
      </div>

      {/* Privacy */}
      <section id="privacy" className="relative max-w-6xl mx-auto px-6 py-24 border-t border-zinc-900">
        <div className="grid md:grid-cols-[1fr_1.4fr] gap-12">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-3">Privacy &amp; safety</div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Lazy,
              <br />
              <span className="text-cyan-400">not reckless.</span>
            </h2>
            <p className="mt-6 text-zinc-400 text-sm max-w-sm">
              Everything except the optional AI works offline, on your device. Here's exactly where the lines are.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-px bg-zinc-900">
            {SAFETY.map((f) => (
              <div key={f.t} className="bg-[#0a0a0b] p-6">
                <div className="flex items-baseline gap-3">
                  <span className="text-cyan-400">⚡</span>
                  <div>
                    <div className="font-semibold">{f.t}</div>
                    <p className="text-sm text-zinc-400 mt-1 leading-relaxed">{f.d}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Install */}
      <section id="install" className="relative max-w-6xl mx-auto px-6 py-24 border-t border-zinc-900">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-3">Install in 2 minutes</div>
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-12">
          Load it unpacked.
        </h2>
        <ol className="space-y-6 max-w-2xl">
          {[
            "Download the .zip and unzip it somewhere you'll remember.",
            <>Open <code className="text-cyan-400 font-mono">chrome://extensions</code> (or <code className="text-cyan-400 font-mono">edge://extensions</code>).</>,
            <>Toggle <strong>Developer mode</strong> on (top-right).</>,
            <>Click <strong>Load unpacked</strong> and pick the unzipped folder. Pin SmartFill to your toolbar.</>,
            <>Click <strong>Open tracker</strong> in the popup, then <strong>Your CV</strong>: upload or paste your CV.</>,
            <>Optional: under <strong className="text-violet-300">✦ AI settings</strong>, add a Gemini or Groq key and click <strong>Test connection</strong>.</>,
            "Fill your next application by hand once — from then on, SmartFill takes it from there.",
          ].map((step, i) => (
            <li key={i} className="flex gap-5">
              <span className="text-cyan-400 font-mono text-sm pt-1 shrink-0 w-6">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-zinc-300">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-12">
          <DownloadButton />
        </div>
      </section>

      <footer className="relative max-w-6xl mx-auto px-6 py-10 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-500">
        <span>SmartFill · Job applications, filled, scored and tracked</span>
        <span className="font-mono">v1.0.0</span>
      </footer>
    </div>
  );
}

function Feature({
  kicker,
  title,
  image,
  alt,
  children,
  wide,
  narrow,
  flip,
}: {
  kicker: string;
  title: ReactNode;
  image: string;
  alt: string;
  children: ReactNode;
  wide?: boolean;
  narrow?: boolean;
  flip?: boolean;
}) {
  const shot = (
    <img
      src={image}
      alt={alt}
      loading="lazy"
      className={`border border-zinc-800 shadow-[0_30px_80px_-30px_rgba(34,211,238,0.3)] ${narrow ? "max-w-[340px] w-full mx-auto" : "w-full"}`}
    />
  );
  const text = (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-3">{kicker}</div>
      <h2 className="text-3xl md:text-4xl font-bold tracking-tight">{title}</h2>
      <div className="mt-6 space-y-4 text-zinc-400 leading-relaxed">{children}</div>
    </div>
  );
  return (
    <section className="relative max-w-6xl mx-auto px-6 py-20 border-t border-zinc-900">
      {wide ? (
        <div className="space-y-10">
          <div className="max-w-3xl">{text}</div>
          {shot}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className={flip ? "md:order-2" : ""}>{text}</div>
          <div className={flip ? "md:order-1" : ""}>{shot}</div>
        </div>
      )}
    </section>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="text-cyan-400 shrink-0">→</span>
      <span>{children}</span>
    </li>
  );
}

function Legend() {
  return (
    <ul className="space-y-2 text-sm">
      <li className="flex gap-3 items-baseline"><span className="w-3 h-3 shrink-0 bg-emerald-500 translate-y-0.5" /><span><strong className="text-zinc-200">Green</strong> — filled confidently. Check it and move on.</span></li>
      <li className="flex gap-3 items-baseline"><span className="w-3 h-3 shrink-0 bg-amber-500 translate-y-0.5" /><span><strong className="text-zinc-200">Amber</strong> — a suggestion or an AI draft. Review it.</span></li>
      <li className="flex gap-3 items-baseline"><span className="w-3 h-3 shrink-0 bg-red-500 translate-y-0.5" /><span><strong className="text-zinc-200">Red</strong> — recognised, but nothing saved for it yet.</span></li>
    </ul>
  );
}

const STATUS_STYLES = {
  filled: "border-emerald-500/70 bg-emerald-500/[0.05]",
  review: "border-amber-500/80 bg-amber-500/[0.05]",
  missing: "border-red-500/70 bg-[#0a0a0b]",
};

function MockField({
  label,
  value,
  placeholder,
  status,
  ai,
  tall,
}: {
  label: string;
  value: string;
  placeholder?: string;
  status: keyof typeof STATUS_STYLES;
  ai?: boolean;
  tall?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1.5">{label}</div>
      <div className={`relative border-2 ${STATUS_STYLES[status]} px-3 py-2.5 text-sm ${tall ? "leading-relaxed" : "font-mono"}`}>
        <span className={value ? "text-zinc-200" : "text-zinc-600"}>{value || placeholder}</span>
        {ai && (
          <span className="absolute -top-2.5 right-2 bg-violet-400 text-black text-[10px] font-bold px-1.5 py-0.5 uppercase tracking-[0.08em]">
            ✦ AI draft
          </span>
        )}
      </div>
    </div>
  );
}

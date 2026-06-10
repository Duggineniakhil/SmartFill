import { useEffect, useState } from "react";
import iconUrl from "@/assets/autoflow-icon.png?url";
import GridScan from "@/components/ui/GridScan";

const STEPS = [
  { n: "01", t: "Fill once", d: "Submit any form — internship app, signup, contact page. SmartFill watches silently." },
  { n: "02", t: "It learns", d: "Name, email, phone, college, GPA, LinkedIn, GitHub — saved on your device. Never passwords." },
  { n: "03", t: "Autofill anywhere", d: "Next time a similar field shows up, a ⚡ badge offers to fill it. One click, done." },
];

const FEATURES = [
  { t: "Smart field matching", d: "“Personal Email”, “Contact Email”, “E-mail Address” all map to one canonical field." },
  { t: "Privacy by default", d: "Everything in chrome.storage.local. No server, no telemetry, no account." },
  { t: "Safe-by-design", d: "Passwords, OTPs, CVVs, and card numbers are explicitly ignored — never captured, never filled." },
  { t: "Manual or auto", d: "Click the ⚡ badge, or flip on auto-fill for known forms." },
];

export default function AutoFlowLanding() {
  const [downloading, setDownloading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    document.title = "SmartFill — Smart form autofill that learns";
  }, []);

  const download = () => {
    setDownloading(true);
    setErr(null);
    fetch("/smartfill-extension.zip")
      .then((r) => {
        if (!r.ok) throw new Error(`Download failed: ${r.status}`);
        return r.blob();
      })
      .then((blob) => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "smartfill-extension.zip";
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setDownloading(false));
  };

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
        <a
          href="#install"
          className="text-xs uppercase tracking-[0.12em] text-zinc-400 hover:text-cyan-400 transition"
        >
          Install →
        </a>
      </header>

      {/* Hero */}
      <section className="relative max-w-6xl mx-auto px-6 pt-16 pb-24 grid lg:grid-cols-[1.2fr_1fr] gap-12 items-center">
        <div>
          <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-cyan-400 mb-6">
            <span className="w-2 h-2 bg-cyan-400" /> Chrome extension · MV3
          </div>
          <h1 className="text-5xl md:text-7xl font-bold leading-[0.95] tracking-tight">
            Stop retyping the
            <br />
            <span className="text-cyan-400">same form.</span>
            <br />
            Forever.
          </h1>
          <p className="mt-6 text-lg text-zinc-400 max-w-xl">
            SmartFill watches the forms you actually fill, learns who you are, and
            quietly offers to fill matching fields anywhere on the web — privately,
            on your device.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-4">
            <button
              onClick={download}
              disabled={downloading}
              className="bg-cyan-400 hover:bg-cyan-300 text-black font-semibold px-6 py-3 rounded-none uppercase tracking-[0.08em] text-sm transition disabled:opacity-50"
            >
              {downloading ? "Packaging…" : "Download extension (.zip)"}
            </button>
            <a
              href="#how"
              className="text-sm uppercase tracking-[0.12em] text-zinc-300 border border-zinc-700 hover:border-cyan-400 hover:text-cyan-400 px-5 py-3 transition"
            >
              How it works
            </a>
          </div>
          {err && <p className="mt-4 text-sm text-red-400">{err}</p>}
          <p className="mt-4 text-xs text-zinc-500">
            No account. No tracking. Works in Chrome, Edge, Brave, Arc.
          </p>
        </div>

        {/* Mock browser */}
        <div className="relative">
          <div className="border border-zinc-800 bg-[#111114] shadow-[0_30px_80px_-20px_rgba(34,211,238,0.25)]">
            <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-800">
              <span className="w-2.5 h-2.5 bg-zinc-700 rounded-full" />
              <span className="w-2.5 h-2.5 bg-zinc-700 rounded-full" />
              <span className="w-2.5 h-2.5 bg-zinc-700 rounded-full" />
              <span className="ml-3 text-[11px] text-zinc-500 font-mono">
                careers.acme.com/apply
              </span>
            </div>
            <div className="p-6 space-y-4">
              <MockField label="Applicant Name" value="Akhil Reddy" filled />
              <MockField label="Personal Email" value="akhil@gmail.com" filled />
              <MockField label="Mobile Number" value="9032855330" filled />
              <MockField label="University" value="Amrita" filled />
              <MockField label="Current GPA" value="8.4" badge />
              <MockField label="LinkedIn Profile" value="" placeholder="linkedin.com/in/…" badge />
            </div>
          </div>
        </div>
      </section>

      {/* How */}
      <section id="how" className="relative max-w-6xl mx-auto px-6 py-24 border-t border-zinc-900">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-3">How it works</div>
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight max-w-2xl">
          Three steps. Then it just works.
        </h2>
        <div className="mt-14 grid md:grid-cols-3 gap-px bg-zinc-900">
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
      <section className="relative max-w-6xl mx-auto px-6 py-24 border-t border-zinc-900">
        <div className="grid md:grid-cols-2 gap-12">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-3">What's inside</div>
            <h2 className="text-4xl md:text-5xl font-bold tracking-tight">
              Built like an
              <br />
              <span className="text-cyan-400">engineer</span> would want it.
            </h2>
          </div>
          <div className="space-y-px bg-zinc-900">
            {FEATURES.map((f) => (
              <div key={f.t} className="bg-[#0a0a0b] py-6">
                <div className="flex items-baseline gap-3">
                  <span className="text-cyan-400">⚡</span>
                  <div>
                    <div className="font-semibold">{f.t}</div>
                    <p className="text-sm text-zinc-400 mt-1">{f.d}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Install */}
      <section id="install" className="relative max-w-6xl mx-auto px-6 py-24 border-t border-zinc-900">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 mb-3">Install in 60 seconds</div>
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-12">
          Load it unpacked.
        </h2>
        <ol className="space-y-6 max-w-2xl">
          {[
            "Download the .zip and unzip it somewhere you'll remember.",
            <>Open <code className="text-cyan-400 font-mono">chrome://extensions</code> in your browser.</>,
            <>Toggle <strong>Developer mode</strong> on (top-right).</>,
            <>Click <strong>Load unpacked</strong> and pick the unzipped folder.</>,
            "Pin SmartFill to your toolbar, then fill any form to teach it.",
          ].map((step, i) => (
            <li key={i} className="flex gap-5">
              <span className="text-cyan-400 font-mono text-sm pt-1 shrink-0 w-6">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-zinc-300">{step}</span>
            </li>
          ))}
        </ol>
        <div className="mt-12">
          <button
            onClick={download}
            disabled={downloading}
            className="bg-cyan-400 hover:bg-cyan-300 text-black font-semibold px-6 py-3 uppercase tracking-[0.08em] text-sm transition disabled:opacity-50"
          >
            {downloading ? "Packaging…" : "Download extension (.zip)"}
          </button>
        </div>
      </section>

      <footer className="relative max-w-6xl mx-auto px-6 py-10 border-t border-zinc-900 flex items-center justify-between text-xs text-zinc-500">
        <span>SmartFill · Privacy-first form autofill</span>
        <span className="font-mono">v1.0.0</span>
      </footer>
    </div>
  );
}

function MockField({
  label,
  value,
  placeholder,
  filled,
  badge,
}: {
  label: string;
  value: string;
  placeholder?: string;
  filled?: boolean;
  badge?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 mb-1.5">{label}</div>
      <div
        className={`relative border ${
          filled ? "border-cyan-400/40 bg-cyan-400/[0.04]" : "border-zinc-800 bg-[#0a0a0b]"
        } px-3 py-2.5 text-sm font-mono`}
      >
        <span className={value ? "text-zinc-200" : "text-zinc-600"}>
          {value || placeholder}
        </span>
        {badge && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 bg-cyan-400 text-black text-xs w-5 h-5 inline-flex items-center justify-center font-bold shadow-[0_0_12px_rgba(34,211,238,0.6)]">
            ⚡
          </span>
        )}
      </div>
    </div>
  );
}
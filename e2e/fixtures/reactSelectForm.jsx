// Test page for the end-to-end run: real react-select (as used by Greenhouse's
// newer job boards) plus a Workday-style listbox button. Bundled with esbuild
// by e2e/extension.e2e.mjs; the chosen values are mirrored into <output>s so
// the test can read React's own state.
import React from "react";
import { createRoot } from "react-dom/client";
import Select from "react-select";

const LEVELS = ["Junior (0-2 years)", "Mid-level (3-5 years)", "Senior (6+ years)"].map((l, i) => ({ value: `l${i}`, label: l }));
const LANGS = ["Python", "Go", "SQL", "Rust"].map((l) => ({ value: l.toLowerCase(), label: l }));

function WorkdayButton({ id, label, options, onPick, value }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <button id={id} type="button" aria-haspopup="listbox" aria-expanded={open}
        aria-label={`${label} ${value || "Select One"} Required`} onClick={() => setOpen(!open)}
        onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
        {value || "Select One"}
      </button>
      {open && (
        <ul role="listbox">
          {options.map((o) => (
            <li key={o} role="option" aria-selected={value === o} onClick={() => { onPick(o); setOpen(false); }}>
              <div data-automation-label={o}>{o}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function App() {
  const [level, setLevel] = React.useState(null);
  const [langs, setLangs] = React.useState([]);
  const [auth, setAuth] = React.useState("");
  return (
    <form>
      <h1>Backend Engineer — Initech</h1>
      <label id="level-label" htmlFor="level">What is your experience level?</label>
      <Select inputId="level" aria-labelledby="level-label" classNamePrefix="select" options={LEVELS} value={level} onChange={setLevel} />
      <label id="langs-label" htmlFor="langs">Which languages do you use professionally?</label>
      <Select inputId="langs" aria-labelledby="langs-label" classNamePrefix="select" isMulti options={LANGS} value={langs} onChange={setLangs} />
      <WorkdayButton id="auth" label="Are you legally authorized to work in Germany?" options={["Yes", "No"]} value={auth} onPick={setAuth} />
      <output id="out-level">{level ? level.value : ""}</output>
      <output id="out-langs">{langs.map((l) => l.value).join(",")}</output>
      <output id="out-auth">{auth}</output>
    </form>
  );
}

createRoot(document.getElementById("root")).render(<App />);

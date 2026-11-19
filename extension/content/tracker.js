// SmartFill content script - application tracker.
// Recognises job-application pages, reads the company and role, and logs an
// application when the user clicks the final submit button. Everything is
// stored in chrome.storage.local under APPLICATIONS_KEY, on this device only.
"use strict";
(function () {
    if (window.__SMARTFILL__?.tracker)
        return;
    const APPLICATIONS_KEY = "smartfill_applications";
    const REQUIREMENTS_KEY = "smartfill_job_requirements";
    const REQUIREMENTS_MAX = 100;
    const TEXTS_KEY = "smartfill_job_texts";
    const TEXTS_MAX = 30;
    const TEXT_LIMIT = 12000;
    const MIN_DESCRIPTION = 200;
    const STATUS_RANK = {
        interested: 0, applied: 1, interview: 2, offer: 3, rejected: 4, withdrawn: 4,
    };
    const PLATFORMS = [
        { id: "greenhouse", name: "Greenhouse", test: (u) => /(^|\.)greenhouse\.io$/.test(u.hostname) },
        { id: "lever", name: "Lever", test: (u) => /(^|\.)lever\.co$/.test(u.hostname) },
        { id: "workday", name: "Workday", test: (u) => /(^|\.)myworkday(jobs|site)?\.com$/.test(u.hostname) },
        { id: "ashby", name: "Ashby", test: (u) => /(^|\.)ashbyhq\.com$/.test(u.hostname) },
        { id: "linkedin", name: "LinkedIn", test: (u) => /(^|\.)linkedin\.com$/.test(u.hostname) && u.pathname.startsWith("/jobs") },
        { id: "smartrecruiters", name: "SmartRecruiters", test: (u) => /(^|\.)smartrecruiters\.com$/.test(u.hostname) },
        { id: "icims", name: "iCIMS", test: (u) => /(^|\.)icims\.com$/.test(u.hostname) },
        { id: "wellfound", name: "Wellfound", test: (u) => /(^|\.)wellfound\.com$/.test(u.hostname) && u.pathname.includes("/jobs") },
        { id: "google_forms", name: "Google Forms", test: (u) => u.hostname === "docs.google.com" && u.pathname.startsWith("/forms") },
    ];
    // Only the final step of an application counts. "Apply" / "Apply now" open
    // the form, and "Next" / "Continue" move between Workday pages.
    const SUBMIT_TEXT = /^(submit|submit (my |your |the )?application|send( my)? application|complete application|finish application)$/i;
    const JOBISH_PATH = /(^|[/._-])(careers?|jobs?|apply|application|positions?|openings?|vacanc(y|ies)|recruit(ing|ment)?|hiring)([/._-]|$)/i;
    const JOBISH_TEXT = /\b(job|application|apply|applicant|hiring|internship|recruit(ment|ing)?|position|vacancy|candidate)\b/i;
    function platformOf(url) {
        return PLATFORMS.find((p) => p.test(url)) || null;
    }
    function clean(s, max = 140) {
        return String(s || "").replace(/\s+/g, " ").trim().slice(0, max);
    }
    // Job boards fill unknown address parts with words like "UNAVAILABLE".
    const PLACEHOLDER = /^(unavailable|not available|n\/?a|null|undefined|none|not specified|unknown|tbd|-+|\.+)$/i;
    function joinPlace(parts) {
        return parts.map((x) => clean(String(x ?? ""))).filter((x) => x && !PLACEHOLDER.test(x)).join(", ");
    }
    function titleCase(slug) {
        return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
    }
    // A stable key for one job posting, so the description page, the /apply page
    // and an embedded form all land on the same record.
    function jobKey(href) {
        const u = new URL(href);
        const host = u.hostname.replace(/^www\./, "");
        const p = platformOf(u)?.id;
        let m;
        if (p === "greenhouse") {
            const id = u.searchParams.get("token") || u.searchParams.get("gh_jid") || (u.pathname.match(/\/jobs\/(\d+)/) || [])[1];
            if (id)
                return `greenhouse:${id}`;
        }
        if (u.searchParams.get("gh_jid"))
            return `greenhouse:${u.searchParams.get("gh_jid")}`;
        if (p === "lever" && (m = u.pathname.match(/^\/([^/]+)\/([0-9a-f-]{20,})/i)))
            return `lever:${m[2]}`;
        if (p === "ashby" && (m = u.pathname.match(/^\/([^/]+)\/([0-9a-f-]{20,})/i)))
            return `ashby:${m[2]}`;
        if (p === "linkedin") {
            const id = (u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/) || [])[1] || u.searchParams.get("currentJobId");
            if (id)
                return `linkedin:${id}`;
        }
        if (p === "icims" && (m = u.pathname.match(/^\/jobs\/(\d+)/)))
            return `icims:${host}:${m[1]}`;
        if (p === "google_forms" && (m = u.pathname.match(/\/forms\/(?:u\/\d+\/)?d\/(?:e\/)?([^/]+)/)))
            return `gforms:${m[1]}`;
        // Generic: drop the query, the hash and a trailing apply step.
        const path = u.pathname
            .replace(/\/(apply|application|applymanually|autofillwithresume|useMyLastApplication)(\/.*)?$/i, "")
            .replace(/\/+$/, "");
        return `${host}${path}`.toLowerCase();
    }
    // Link back to the posting rather than the application step.
    function jobLink(href) {
        const u = new URL(href);
        const keep = ["gh_jid", "token", "for", "currentJobId"];
        const params = new URLSearchParams();
        for (const k of keep)
            if (u.searchParams.get(k))
                params.set(k, u.searchParams.get(k));
        const path = u.pathname.replace(/\/(apply|application)(\/.*)?$/i, "") || "/";
        const q = params.toString();
        return `${u.origin}${path}${q ? `?${q}` : ""}`;
    }
    function readJsonLd(doc) {
        for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
            let data;
            try {
                data = JSON.parse(script.textContent || "");
            }
            catch {
                continue;
            }
            const queue = [data];
            while (queue.length) {
                const item = queue.shift();
                if (!item || typeof item !== "object")
                    continue;
                if (Array.isArray(item)) {
                    queue.push(...item);
                    continue;
                }
                const obj = item;
                if (obj["@graph"])
                    queue.push(obj["@graph"]);
                const type = obj["@type"];
                if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) {
                    const org = obj.hiringOrganization;
                    const locs = [].concat(obj.jobLocation || []);
                    const place = locs.map((l) => {
                        const addr = l?.address;
                        if (!addr)
                            return "";
                        if (typeof addr === "string")
                            return joinPlace([addr]);
                        return joinPlace([addr.addressLocality, addr.addressRegion, addr.addressCountry]
                            .map((x) => (typeof x === "object" && x ? x.name : x)));
                    }).filter(Boolean)[0];
                    const remote = obj.jobLocationType === "TELECOMMUTE" ? "Remote" : "";
                    return {
                        description: typeof obj.description === "string" ? obj.description : "",
                        title: clean(obj.title),
                        company: clean(typeof org === "string" ? org : org?.name),
                        location: clean(place || remote),
                    };
                }
            }
        }
        return null;
    }
    function text(doc, selectors) {
        for (const sel of selectors) {
            const el = doc.querySelector(sel);
            const t = clean(el?.textContent);
            if (t)
                return t;
        }
        return "";
    }
    // iCIMS keeps the real location in its page data ("Hyderabad, Telangana,
    // India") and in a header tag ("IN-Telangana-Hyderabad").
    function icimsLocation(doc) {
        for (const script of Array.from(doc.querySelectorAll("script:not([src])"))) {
            const m = (script.textContent || "").match(/icimsSD\s*=\s*(\{.*\})\s*;?\s*$/m);
            if (!m)
                continue;
            try {
                const loc = JSON.parse(m[1])?.job?.location;
                const place = typeof loc === "string" ? joinPlace(loc.split(/\s*,\s*/)) : "";
                if (place)
                    return place;
            }
            catch { /* not plain JSON */ }
        }
        for (const tag of Array.from(doc.querySelectorAll(".iCIMS_JobHeaderTag"))) {
            if (!/location/i.test(tag.querySelector("dt")?.textContent || ""))
                continue;
            const raw = clean(tag.querySelector("dd")?.textContent);
            const parts = raw.split(/\s*\|\s*/)[0].split("-").map((x) => x.trim());
            // "IN-Telangana-Hyderabad" → "Hyderabad, Telangana, IN"
            const place = /^[A-Z]{2}$/.test(parts[0] || "") && parts.length > 1 ? joinPlace(parts.reverse()) : joinPlace([raw]);
            if (place)
                return place;
        }
        return "";
    }
    function meta(doc, prop) {
        return clean(doc.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`)?.getAttribute("content"));
    }
    // "Software Engineer at Acme", "Software Engineer - Acme | Careers", ...
    function splitTitle(raw) {
        const t = raw.replace(/\s*[|·–—-]\s*(careers?|jobs?|job application|linkedin|greenhouse|lever|workday|ashby)\s*$/i, "");
        const at = t.match(/^(.+?)\s+(?:at|@)\s+(.+?)(?:\s*[|·–—-].*)?$/i);
        if (at)
            return { title: clean(at[1]), company: clean(at[2]) };
        const parts = t.split(/\s+[|·–—]\s+|\s+-\s+/).map((s) => clean(s)).filter(Boolean);
        if (parts.length >= 2)
            return { title: parts[0], company: parts[1] };
        return { title: clean(t), company: "" };
    }
    function extractJob(doc, href) {
        const url = new URL(href);
        const platform = platformOf(url);
        const ld = readJsonLd(doc);
        let title = ld?.title || "";
        let company = ld?.company || "";
        let location = ld?.location || "";
        const seg = url.pathname.split("/").filter(Boolean);
        switch (platform?.id) {
            case "greenhouse":
                title ||= text(doc, [".app-title", ".job__title h1", "h1.section-header", "h1"]);
                company ||= text(doc, [".company-name"]).replace(/^at\s+/i, "")
                    || titleCase(url.searchParams.get("for") || (seg[0] !== "embed" ? seg[0] || "" : ""));
                location ||= text(doc, [".location", ".job__location"]);
                break;
            case "lever":
                title ||= text(doc, [".posting-headline h2", "h2"]);
                company ||= titleCase(seg[0] || "");
                location ||= text(doc, [".posting-categories .location", ".sort-by-location"]);
                break;
            case "ashby":
                title ||= text(doc, ["h1"]);
                company ||= titleCase(decodeURIComponent(seg[0] || ""));
                break;
            case "workday":
                title ||= text(doc, ['[data-automation-id="jobPostingHeader"]', "h2", "h1"]);
                company ||= titleCase(url.hostname.split(".")[0]);
                location ||= text(doc, ['[data-automation-id="locations"] dd', '[data-automation-id="locations"]']);
                break;
            case "linkedin":
                title ||= text(doc, [".job-details-jobs-unified-top-card__job-title", ".jobs-unified-top-card__job-title", ".top-card-layout__title", "h1"]);
                company ||= text(doc, [".job-details-jobs-unified-top-card__company-name", ".jobs-unified-top-card__company-name", ".topcard__org-name-link"]);
                break;
            case "smartrecruiters":
                title ||= text(doc, ["h1.job-title", "h1"]);
                company ||= titleCase(seg[0] || "");
                break;
            case "icims":
                title ||= text(doc, [".iCIMS_Header h1", "h1.iCIMS_Header", "h1"]);
                location = icimsLocation(doc) || location;
                break;
            case "google_forms":
                title ||= text(doc, ['[role="heading"][aria-level="1"]', '[role="heading"]']) || clean(doc.title);
                break;
        }
        if (!title || !company) {
            const fromTitle = splitTitle(meta(doc, "og:title") || doc.title || "");
            title ||= fromTitle.title || text(doc, ["h1"]);
            company ||= fromTitle.company || meta(doc, "og:site_name");
        }
        if (!company && platform?.id !== "google_forms") {
            company = titleCase(url.hostname.replace(/^(www|jobs|careers|apply|boards|job-boards)\./, "").split(".")[0]);
        }
        return {
            key: jobKey(href),
            url: jobLink(href),
            title: title || "Untitled role",
            company: company || "Unknown company",
            location,
            platform: platform?.name || "Company site",
        };
    }
    // HTML (often entity-encoded in JSON-LD) to text with line breaks kept, so
    // requirement lists stay one item per line.
    function htmlToText(html) {
        const decode = (s) => new DOMParser().parseFromString(`<!doctype html><body>${s}`, "text/html").body.textContent || "";
        let t = html;
        if (!/<[a-z]/i.test(t) && /&lt;/i.test(t))
            t = decode(t);
        t = t.replace(/<\s*(br|\/p|\/li|\/h[1-6]|\/div|\/ul|\/ol|li|p|h[1-6])\b[^>]*>/gi, "\n").replace(/<[^>]+>/g, " ");
        return decode(t.replace(/</g, "&lt;")).replace(/[ \t]+/g, " ").replace(/\n\s*/g, "\n").trim();
    }
    const DESCRIPTION_SELECTORS = [
        ".posting-page", '[data-qa="job-description"]',
        '[data-automation-id="jobPostingDescription"]',
        ".job__description", "#content .body", "#content",
        ".jobs-description__content", ".jobs-description", "#job-details", ".description__text",
        ".ashby-job-posting-description", '[class*="descriptionText"]',
        '[class*="job-description"]', '[class*="jobDescription"]', "#job-description",
        "main", "article", '[role="main"]',
    ];
    function jobDescription(doc) {
        const ld = readJsonLd(doc);
        if (ld?.description) {
            const t = htmlToText(ld.description);
            if (t.length >= MIN_DESCRIPTION)
                return t.slice(0, 30000);
        }
        for (const sel of DESCRIPTION_SELECTORS) {
            const el = doc.querySelector(sel);
            if (!el)
                continue;
            // innerText keeps line breaks on a rendered page; textContent elsewhere.
            const t = String(el.innerText || el.textContent || "").replace(/[ \t]+/g, " ").trim();
            if (t.length >= MIN_DESCRIPTION)
                return t.slice(0, 30000);
        }
        return "";
    }
    function readUserSkills() {
        return new Promise((resolve) => {
            chrome.storage.local.get(["smartfill_profile"], (d) => resolve(d.smartfill_profile?.fields?.skills || ""));
        });
    }
    function cachedRequirements(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get([REQUIREMENTS_KEY], (d) => resolve(d[REQUIREMENTS_KEY]?.[key]?.requirements || null));
        });
    }
    // Remember what a posting asks for, so its apply page (which usually has no
    // description) and the tracker board can still score it.
    function cacheRequirements(key, requirements) {
        return new Promise((resolve) => {
            chrome.storage.local.get([REQUIREMENTS_KEY, APPLICATIONS_KEY], (d) => {
                const all = { ...(d[REQUIREMENTS_KEY] || {}), [key]: { requirements, at: new Date().toISOString() } };
                const trimmed = Object.fromEntries(Object.entries(all)
                    .sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, REQUIREMENTS_MAX));
                const updates = { [REQUIREMENTS_KEY]: trimmed };
                const app = d[APPLICATIONS_KEY]?.[key];
                if (app && !app.requirements)
                    updates[APPLICATIONS_KEY] = { ...d[APPLICATIONS_KEY], [key]: { ...app, requirements } };
                chrome.storage.local.set(updates, () => resolve());
            });
        });
    }
    async function requirementsHere(doc) {
        const match = window.__SMARTFILL__.match;
        if (!match)
            return null;
        const text = jobDescription(doc);
        if (text.length < MIN_DESCRIPTION)
            return null;
        return match.extractRequirements(text, await readUserSkills());
    }
    // The description itself is kept for AI drafting on the apply page.
    function cacheText(key, text) {
        return new Promise((resolve) => {
            chrome.storage.local.get([TEXTS_KEY], (d) => {
                const all = { ...(d[TEXTS_KEY] || {}), [key]: { text: text.slice(0, TEXT_LIMIT), at: new Date().toISOString() } };
                const trimmed = Object.fromEntries(Object.entries(all)
                    .sort((a, b) => b[1].at.localeCompare(a[1].at)).slice(0, TEXTS_MAX));
                chrome.storage.local.set({ [TEXTS_KEY]: trimmed }, () => resolve());
            });
        });
    }
    function cachedText(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get([TEXTS_KEY], (d) => resolve(d[TEXTS_KEY]?.[key]?.text || ""));
        });
    }
    async function requirementsFor(job) {
        const here = await requirementsHere(document);
        if (here && (here.required.length || here.preferred.length || here.years !== null)) {
            await cacheRequirements(job.key, here);
            await cacheText(job.key, jobDescription(document));
            return here;
        }
        return cachedRequirements(job.key);
    }
    function isJobPage(doc, href) {
        const url = new URL(href);
        const platform = platformOf(url);
        if (platform?.id === "google_forms") {
            // Google Forms are used for everything: only count application forms.
            return JOBISH_TEXT.test(`${doc.title} ${text(doc, ['[role="heading"]'])}`);
        }
        if (platform)
            return true;
        if (readJsonLd(doc))
            return true;
        const jobish = JOBISH_PATH.test(url.pathname) || /^(jobs|careers|apply)\./i.test(url.hostname);
        return jobish && doc.querySelector('input[type="file"]') !== null;
    }
    // Combine an existing record with a new sighting. Status only moves forward,
    // so re-opening a job you interviewed for never resets it to "Applied".
    function mergeApplication(existing, job, status, now) {
        if (!existing) {
            return {
                id: job.key, url: job.url, title: job.title, company: job.company,
                location: job.location, platform: job.platform, status,
                createdAt: now, updatedAt: now,
                appliedAt: status === "applied" ? now : undefined,
                history: [{ status, at: now }], notes: "",
            };
        }
        const next = {
            ...existing,
            title: existing.title && existing.title !== "Untitled role" ? existing.title : job.title,
            company: existing.company && existing.company !== "Unknown company" ? existing.company : job.company,
            location: existing.location || job.location,
        };
        if (STATUS_RANK[status] > STATUS_RANK[existing.status] && STATUS_RANK[existing.status] < STATUS_RANK.rejected) {
            next.status = status;
            next.updatedAt = now;
            next.history = [...(existing.history || []), { status, at: now }];
            if (status === "applied" && !next.appliedAt)
                next.appliedAt = now;
        }
        return next;
    }
    function record(job, status) {
        return new Promise((resolve) => {
            chrome.storage.local.get([APPLICATIONS_KEY, REQUIREMENTS_KEY, "enabled"], (data) => {
                if (data.enabled === false) {
                    resolve(null);
                    return;
                }
                const all = { ...(data[APPLICATIONS_KEY] || {}) };
                const merged = mergeApplication(all[job.key], job, status, new Date().toISOString());
                const known = data[REQUIREMENTS_KEY]?.[job.key]?.requirements;
                if (!merged.requirements && known)
                    merged.requirements = known;
                all[job.key] = merged;
                chrome.storage.local.set({ [APPLICATIONS_KEY]: all }, () => resolve(merged));
            });
        });
    }
    function lookup(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get([APPLICATIONS_KEY], (data) => {
                resolve((data[APPLICATIONS_KEY] || {})[key] || null);
            });
        });
    }
    // Read the job details now, while the page still shows them: after submit,
    // many forms swap to a "Thanks for applying" screen.
    let cachedJob = null;
    function currentJob() {
        if (!isJobPage(document, location.href))
            return null;
        const job = extractJob(document, location.href);
        if (!cachedJob || cachedJob.key !== job.key || job.title !== "Untitled role")
            cachedJob = job;
        return cachedJob;
    }
    document.addEventListener("click", (e) => {
        try {
            const target = e.target instanceof Element ? e.target : null;
            const control = target?.closest('button, input[type="submit"], [role="button"]');
            if (!control)
                return;
            const label = control instanceof HTMLInputElement
                ? control.value
                : control.innerText || control.textContent || control.getAttribute("aria-label") || "";
            if (!SUBMIT_TEXT.test(clean(label)))
                return;
            const job = currentJob();
            if (job)
                record(job, "applied");
        }
        catch {
            // Never let tracking break the page's own click handling.
        }
    }, true);
    // Warm the caches once the page has rendered its job details. Single-page
    // job boards (LinkedIn) render the description late, so look twice.
    for (const delay of [1500, 5000]) {
        setTimeout(() => {
            try {
                const job = currentJob();
                if (job)
                    requirementsFor(job).catch(() => { });
            }
            catch { /* ignore */ }
        }, delay);
    }
    window.__SMARTFILL__ = window.__SMARTFILL__ || {};
    window.__SMARTFILL__.tracker = {
        // Called by the popup in every frame of the active tab.
        async jobInfo() {
            const job = currentJob();
            if (!job)
                return null;
            const requirements = await requirementsFor(job).catch(() => null);
            return { job, application: await lookup(job.key), requirements };
        },
        // For a form embedded in a careers page: the description is in the
        // top frame, which is not itself an application page.
        async pageRequirements() {
            if (!JOBISH_TEXT.test(jobDescription(document)))
                return null;
            return requirementsHere(document);
        },
        jobDescription,
        // The description on this page, else the one cached for this job.
        async jobText(key) {
            const here = jobDescription(document);
            return here || (key ? cachedText(key) : "");
        },
        async track(status) {
            const job = currentJob();
            return job ? record(job, status) : null;
        },
        // Exposed for tests.
        jobKey, jobLink, extractJob, isJobPage, mergeApplication, splitTitle,
    };
})();
//# sourceMappingURL=tracker.js.map
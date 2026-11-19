// SmartFill - job match score, computed entirely on this device.
// Pulls the skills, years of experience and degree a job description asks for,
// then compares them with the user's CV text and learned profile.
// Loaded as a content script and by the popup and tracker pages, so it must
// not depend on chrome.* APIs.
"use strict";
(function () {
  window.__SMARTFILL__ = window.__SMARTFILL__ || ({} as Window["__SMARTFILL__"]);
  if (window.__SMARTFILL__.match) return;

  // id → display label and the phrases that mean it (lower-case, matched as
  // whole words). `cs` phrases are case-sensitive and only count inside a
  // list ("Python, Go, Rust"), because "Go", "R" and "C" are ordinary words.
  // `word` phrases are case-sensitive whole words anywhere ("Excel", not "excel in").
  type SkillDef = { label: string; aliases: string[]; cs?: string[]; word?: string[] };
  const SKILLS: Record<string, SkillDef> = {
    javascript: { label: "JavaScript", aliases: ["javascript", "ecmascript", "es6"], cs: ["JS"] },
    typescript: { label: "TypeScript", aliases: ["typescript"] },
    python: { label: "Python", aliases: ["python"] },
    java: { label: "Java", aliases: ["java"] },
    kotlin: { label: "Kotlin", aliases: ["kotlin"] },
    scala: { label: "Scala", aliases: ["scala"] },
    go: { label: "Go", aliases: ["golang"], cs: ["Go"] },
    rust: { label: "Rust", aliases: ["rust"] },
    c: { label: "C", aliases: [], cs: ["C"] },
    cpp: { label: "C++", aliases: ["c++", "cpp"] },
    csharp: { label: "C#", aliases: ["c#", "csharp"] },
    dotnet: { label: ".NET", aliases: [".net", "dotnet", "asp.net", ".net core"] },
    php: { label: "PHP", aliases: ["php"] },
    laravel: { label: "Laravel", aliases: ["laravel"] },
    ruby: { label: "Ruby", aliases: ["ruby"] },
    rails: { label: "Ruby on Rails", aliases: ["ruby on rails", "rails"] },
    swift: { label: "Swift", aliases: ["swift", "swiftui"] },
    objc: { label: "Objective-C", aliases: ["objective-c", "objective c"] },
    dart: { label: "Dart", aliases: ["dart"] },
    flutter: { label: "Flutter", aliases: ["flutter"] },
    r: { label: "R", aliases: ["rstudio"], cs: ["R"] },
    matlab: { label: "MATLAB", aliases: ["matlab"] },
    perl: { label: "Perl", aliases: ["perl"] },
    elixir: { label: "Elixir", aliases: ["elixir"] },
    haskell: { label: "Haskell", aliases: ["haskell"] },
    solidity: { label: "Solidity", aliases: ["solidity"] },
    bash: { label: "Bash / shell", aliases: ["bash", "shell scripting", "shell scripts"] },
    powershell: { label: "PowerShell", aliases: ["powershell"] },
    sql: { label: "SQL", aliases: ["sql", "t-sql", "pl/sql"] },
    html: { label: "HTML", aliases: ["html", "html5"] },
    css: { label: "CSS", aliases: ["css", "css3"] },
    sass: { label: "Sass", aliases: ["sass", "scss"] },
    tailwind: { label: "Tailwind CSS", aliases: ["tailwind", "tailwindcss", "tailwind css"] },
    bootstrap: { label: "Bootstrap", aliases: ["bootstrap"] },
    jquery: { label: "jQuery", aliases: ["jquery"] },
    react: { label: "React", aliases: ["react", "react.js", "reactjs"] },
    reactnative: { label: "React Native", aliases: ["react native"] },
    redux: { label: "Redux", aliases: ["redux"] },
    nextjs: { label: "Next.js", aliases: ["next.js", "nextjs"] },
    angular: { label: "Angular", aliases: ["angular", "angularjs"] },
    vue: { label: "Vue", aliases: ["vue", "vue.js", "vuejs", "nuxt"] },
    svelte: { label: "Svelte", aliases: ["svelte", "sveltekit"] },
    node: { label: "Node.js", aliases: ["node.js", "nodejs", "node"] },
    express: { label: "Express", aliases: ["express.js", "expressjs"] },
    nestjs: { label: "NestJS", aliases: ["nestjs", "nest.js"] },
    django: { label: "Django", aliases: ["django"] },
    flask: { label: "Flask", aliases: ["flask"] },
    fastapi: { label: "FastAPI", aliases: ["fastapi"] },
    spring: { label: "Spring Boot", aliases: ["spring boot", "spring framework", "springboot"] },
    hibernate: { label: "Hibernate", aliases: ["hibernate"] },
    graphql: { label: "GraphQL", aliases: ["graphql"] },
    rest: { label: "REST APIs", aliases: ["rest api", "rest apis", "restful", "rest services"] },
    grpc: { label: "gRPC", aliases: ["grpc"] },
    websockets: { label: "WebSockets", aliases: ["websocket", "websockets"] },
    microservices: { label: "Microservices", aliases: ["microservices", "microservice"] },
    distributed: { label: "Distributed systems", aliases: ["distributed systems"] },
    systemdesign: { label: "System design", aliases: ["system design"] },
    dsa: { label: "Data structures & algorithms", aliases: ["data structures", "algorithms", "dsa"] },
    oop: { label: "Object-oriented programming", aliases: ["object oriented", "object-oriented", "oop"] },
    webpack: { label: "Webpack", aliases: ["webpack"] },
    vite: { label: "Vite", aliases: ["vite"] },
    jest: { label: "Jest", aliases: ["jest"] },
    cypress: { label: "Cypress", aliases: ["cypress"] },
    playwright: { label: "Playwright", aliases: ["playwright"] },
    selenium: { label: "Selenium", aliases: ["selenium"] },
    testing: { label: "Automated testing", aliases: ["unit testing", "unit tests", "test automation", "automated testing", "tdd", "test-driven"] },
    git: { label: "Git", aliases: ["git"] },
    github: { label: "GitHub", aliases: ["github"] },
    cicd: { label: "CI/CD", aliases: ["ci/cd", "ci cd", "continuous integration", "continuous delivery", "continuous deployment"] },
    githubactions: { label: "GitHub Actions", aliases: ["github actions"] },
    jenkins: { label: "Jenkins", aliases: ["jenkins"] },
    linux: { label: "Linux", aliases: ["linux", "unix"] },
    docker: { label: "Docker", aliases: ["docker", "containers", "containerization"] },
    kubernetes: { label: "Kubernetes", aliases: ["kubernetes", "k8s", "eks", "gke", "aks"] },
    terraform: { label: "Terraform", aliases: ["terraform", "infrastructure as code"] },
    ansible: { label: "Ansible", aliases: ["ansible"] },
    aws: { label: "AWS", aliases: ["aws", "amazon web services", "ec2", "s3"] },
    lambda: { label: "AWS Lambda", aliases: ["aws lambda", "lambda functions"] },
    azure: { label: "Azure", aliases: ["azure", "microsoft azure"] },
    gcp: { label: "Google Cloud", aliases: ["gcp", "google cloud", "bigquery"] },
    serverless: { label: "Serverless", aliases: ["serverless"] },
    nginx: { label: "Nginx", aliases: ["nginx"] },
    postgres: { label: "PostgreSQL", aliases: ["postgresql", "postgres"] },
    mysql: { label: "MySQL", aliases: ["mysql"] },
    sqlserver: { label: "SQL Server", aliases: ["sql server", "mssql"] },
    mongodb: { label: "MongoDB", aliases: ["mongodb", "mongo"] },
    redis: { label: "Redis", aliases: ["redis"] },
    elasticsearch: { label: "Elasticsearch", aliases: ["elasticsearch", "elastic search", "opensearch"] },
    dynamodb: { label: "DynamoDB", aliases: ["dynamodb"] },
    firebase: { label: "Firebase", aliases: ["firebase", "firestore"] },
    supabase: { label: "Supabase", aliases: ["supabase"] },
    kafka: { label: "Kafka", aliases: ["kafka"] },
    rabbitmq: { label: "RabbitMQ", aliases: ["rabbitmq"] },
    spark: { label: "Apache Spark", aliases: ["apache spark", "pyspark"], cs: ["Spark"] },
    hadoop: { label: "Hadoop", aliases: ["hadoop"] },
    airflow: { label: "Airflow", aliases: ["airflow"] },
    snowflake: { label: "Snowflake", aliases: ["snowflake"] },
    dbt: { label: "dbt", aliases: ["dbt"] },
    etl: { label: "ETL / data pipelines", aliases: ["etl", "elt", "data pipelines", "data pipeline"] },
    pandas: { label: "pandas", aliases: ["pandas"] },
    numpy: { label: "NumPy", aliases: ["numpy"] },
    sklearn: { label: "scikit-learn", aliases: ["scikit-learn", "sklearn", "scikit learn"] },
    tensorflow: { label: "TensorFlow", aliases: ["tensorflow", "keras"] },
    pytorch: { label: "PyTorch", aliases: ["pytorch"] },
    ml: { label: "Machine learning", aliases: ["machine learning"], cs: ["ML"] },
    dl: { label: "Deep learning", aliases: ["deep learning", "neural networks"] },
    nlp: { label: "NLP", aliases: ["nlp", "natural language processing"] },
    cv: { label: "Computer vision", aliases: ["computer vision", "opencv"] },
    llm: { label: "LLMs", aliases: ["llm", "llms", "large language models", "generative ai", "genai", "prompt engineering"] },
    stats: { label: "Statistics", aliases: ["statistics", "statistical analysis", "statistical modeling"] },
    dataanalysis: { label: "Data analysis", aliases: ["data analysis", "data analytics", "analytics"] },
    abtesting: { label: "A/B testing", aliases: ["a/b testing", "ab testing", "experimentation"] },
    excel: { label: "Excel", aliases: ["microsoft excel", "ms excel", "spreadsheets", "advanced excel"], word: ["Excel"] },
    vba: { label: "VBA", aliases: ["vba"] },
    tableau: { label: "Tableau", aliases: ["tableau"] },
    powerbi: { label: "Power BI", aliases: ["power bi", "powerbi"] },
    looker: { label: "Looker", aliases: ["looker"] },
    figma: { label: "Figma", aliases: ["figma"] },
    adobexd: { label: "Adobe XD", aliases: ["adobe xd"] },
    photoshop: { label: "Photoshop", aliases: ["photoshop"] },
    illustrator: { label: "Illustrator", aliases: ["illustrator"] },
    uxresearch: { label: "User research", aliases: ["user research", "ux research", "usability testing"] },
    prototyping: { label: "Wireframing & prototyping", aliases: ["wireframing", "wireframes", "prototyping"] },
    android: { label: "Android", aliases: ["android"] },
    ios: { label: "iOS", aliases: ["ios"] },
    unity: { label: "Unity", aliases: ["unity3d", "unity engine"], cs: ["Unity"] },
    unreal: { label: "Unreal Engine", aliases: ["unreal engine", "unreal"] },
    blockchain: { label: "Blockchain", aliases: ["blockchain", "web3", "smart contracts"] },
    security: { label: "Security", aliases: ["cybersecurity", "application security", "appsec", "penetration testing", "owasp", "siem"] },
    oauth: { label: "OAuth / auth", aliases: ["oauth", "oauth2", "openid connect", "sso", "jwt"] },
    jira: { label: "Jira", aliases: ["jira"] },
    agile: { label: "Agile / Scrum", aliases: ["agile", "scrum", "kanban"] },
    projectmgmt: { label: "Project management", aliases: ["project management", "pmp"] },
    productmgmt: { label: "Product management", aliases: ["product management", "product roadmap", "roadmapping"] },
    stakeholder: { label: "Stakeholder management", aliases: ["stakeholder management", "stakeholders"] },
    salesforce: { label: "Salesforce", aliases: ["salesforce"] },
    sap: { label: "SAP", aliases: [], cs: ["SAP"] },
    hubspot: { label: "HubSpot", aliases: ["hubspot"] },
    crm: { label: "CRM", aliases: ["crm"] },
    seo: { label: "SEO", aliases: ["seo", "search engine optimization"] },
    sem: { label: "SEM / paid ads", aliases: ["sem", "google ads", "paid search", "ppc"] },
    ga: { label: "Google Analytics", aliases: ["google analytics", "ga4"] },
    contentmkt: { label: "Content marketing", aliases: ["content marketing", "content strategy"] },
    copywriting: { label: "Copywriting", aliases: ["copywriting"] },
    socialmedia: { label: "Social media", aliases: ["social media"] },
    emailmkt: { label: "Email marketing", aliases: ["email marketing"] },
    sales: { label: "B2B sales", aliases: ["b2b sales", "saas sales", "lead generation", "prospecting"] },
    customersuccess: { label: "Customer success", aliases: ["customer success", "account management"] },
    finmodel: { label: "Financial modelling", aliases: ["financial modeling", "financial modelling", "valuation"] },
    accounting: { label: "Accounting", aliases: ["accounting", "bookkeeping", "gaap", "ifrs"] },
    quickbooks: { label: "QuickBooks", aliases: ["quickbooks"] },
    forecasting: { label: "Budgeting & forecasting", aliases: ["forecasting", "budgeting", "fp&a"] },
    techwriting: { label: "Technical writing", aliases: ["technical writing", "documentation"] },
  };

  const WORD = "a-z0-9+#";
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

  function aliasRegex(aliases: string[], cs: string[] = [], word: string[] = []): RegExp[] {
    const out: RegExp[] = [];
    if (aliases.length) {
      out.push(new RegExp(`(?<![${WORD}.])(?:${aliases.map(esc).join("|")})(?![${WORD}]|\\.[a-z])`, "i"));
    }
    for (const word of cs) {
      // Case-sensitive, and only between list separators: "Java, Go, Rust".
      out.push(new RegExp(`(?:[,/(]\\s*|\\band\\s+|\\bor\\s+)${esc(word)}(?![A-Za-z0-9+#])|(?<![A-Za-z0-9])${esc(word)}(?=\\s*[,/)])`));
    }
    for (const w of word) out.push(new RegExp(`(?<![A-Za-z0-9])${esc(w)}(?![A-Za-z0-9])`));
    return out;
  }

  // Knowing one implies knowing another, for the user's side only.
  const IMPLIES: Record<string, string[]> = {
    postgres: ["sql"], mysql: ["sql"], sqlserver: ["sql"], snowflake: ["sql"], dbt: ["sql"],
    django: ["python"], flask: ["python"], fastapi: ["python"], pandas: ["python"], numpy: ["python"],
    sklearn: ["python", "ml"], pytorch: ["python", "dl", "ml"], tensorflow: ["python", "dl", "ml"], dl: ["ml"],
    spring: ["java"], hibernate: ["java"], express: ["node", "javascript"], nestjs: ["node", "typescript"],
    node: ["javascript"], react: ["javascript"], nextjs: ["react", "javascript"], reactnative: ["react", "javascript"],
    angular: ["typescript", "javascript"], vue: ["javascript"], svelte: ["javascript"], redux: ["react", "javascript"],
    typescript: ["javascript"], laravel: ["php"], rails: ["ruby"], flutter: ["dart"],
    githubactions: ["cicd", "github"], jenkins: ["cicd"], kubernetes: ["docker"], lambda: ["aws", "serverless"],
  };

  const BUILTIN = Object.entries(SKILLS).map(([id, def]) => ({ id, label: def.label, re: aliasRegex(def.aliases, def.cs, def.word) }));
  const builtinByAlias = new Map<string, string>();
  for (const [id, def] of Object.entries(SKILLS)) {
    builtinByAlias.set(norm(def.label), id);
    for (const a of def.aliases) builtinByAlias.set(norm(a), id);
  }

  // Skills the user lists themself ("Unity, Solidity, Kubernetes") also count,
  // even when they aren't in the built-in list.
  function userSkillDefs(skillList: string) {
    const defs: Array<{ id: string; label: string; re: RegExp[] }> = [];
    for (const raw of String(skillList || "").split(/[,;\n|•·]+/)) {
      const label = raw.trim();
      const key = norm(label);
      if (key.length < 2 || key.length > 40 || builtinByAlias.has(key)) continue;
      defs.push({ id: `user:${key}`, label, re: aliasRegex([key]) });
    }
    return defs;
  }

  function findSkills(text: string, extra: ReturnType<typeof userSkillDefs>): Set<string> {
    const found = new Set<string>();
    for (const def of [...BUILTIN, ...extra]) {
      if (def.re.some((re) => re.test(text))) found.add(def.id);
    }
    return found;
  }

  function labelOf(id: string, extra: ReturnType<typeof userSkillDefs> = []): string {
    return SKILLS[id]?.label || extra.find((d) => d.id === id)?.label || id.replace(/^user:/, "");
  }

  // ─── Job description ─────────────────────────────────────────────────────────

  const PREFERRED_HEAD = /^(preferred|nice[- ]to[- ]haves?|bonus|pluses|good[- ]to[- ]have|desired|additional|extra credit|it'?s a plus|even better)/i;
  const REQUIRED_HEAD = /(requirements|qualifications|what you('|’)ll (need|bring)|must[- ]haves?|you have|about you|who you are|responsibilities|what you('|’)ll do|the role|skills)/i;
  const PREFERRED_LINE = /(preferred|nice[- ]to[- ]have|is a plus|are a plus|a bonus|bonus points|ideally|desirable|not required|good to have)/i;

  const NUM_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
  const YEARS_RE = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s*\+?\s*(?:(?:-|–|to)\s*\d{1,2}\s*)?\+?\s*(?:years?|yrs?)\b/gi;

  // Each level has a case-insensitive pattern and a case-sensitive one for
  // short forms ("MS", "BS") that are ordinary words in lower case.
  const DEGREES: Array<{ level: number; ci: RegExp; cs?: RegExp }> = [
    { level: 4, ci: /\b(ph\.?\s?d|doctorate|doctoral)\b/i },
    {
      level: 3,
      ci: /\b(master's|masters|master of|master degree|m\.?\s?tech|m\.?\s?sc|mba|mca|postgraduate degree|m\.s\.|m\.e\.)/i,
      cs: /\bMS\b(?![ -]?(Office|Excel|Word|Teams|SQL|Access|Project|Dynamics))/,
    },
    {
      level: 2,
      ci: /\b(bachelor's|bachelors|bachelor of|bachelor degree|b\.?\s?tech|b\.?\s?sc|bca|undergraduate degree|4[- ]year degree|college degree|university degree|b\.s\.|b\.a\.|b\.e\.)/i,
      cs: /\b(BS|BA|BE)\b/,
    },
    { level: 1, ci: /\b(associate's degree|associate degree|diploma)\b/i },
  ];
  const DEGREE_LABEL = ["", "Diploma", "Bachelor's", "Master's", "PhD"];

  function degreeLevels(text: string): number[] {
    const t = String(text || "").replace(/[’‘]/g, "'");
    return DEGREES.filter((d) => d.ci.test(t) || (d.cs ? d.cs.test(t) : false)).map((d) => d.level);
  }

  function yearsIn(line: string): number[] {
    const out: number[] = [];
    if (!/experience|exp\b|background|working/i.test(line)) return out;
    for (const m of line.matchAll(YEARS_RE)) {
      const n = NUM_WORDS[m[1].toLowerCase()] ?? parseInt(m[1], 10);
      if (n > 0 && n <= 20) out.push(n);
    }
    return out;
  }

  function extractRequirements(text: string, userSkills = ""): SmartFillRequirements {
    const extra = userSkillDefs(userSkills);
    const required = new Set<string>();
    const preferred = new Set<string>();
    const years: number[] = [];
    const degrees: number[] = [];
    let section: "required" | "preferred" = "required";

    for (const raw of String(text || "").split(/\n+/)) {
      const line = raw.trim();
      if (!line) continue;
      if (line.length < 70) {
        if (PREFERRED_HEAD.test(line.replace(/^[#*\-\s]+/, ""))) section = "preferred";
        else if (REQUIRED_HEAD.test(line) && !PREFERRED_LINE.test(line)) section = "required";
      }
      const isPreferred = section === "preferred" || PREFERRED_LINE.test(line);
      for (const id of findSkills(line, extra)) (isPreferred ? preferred : required).add(id);
      if (!isPreferred) {
        years.push(...yearsIn(line));
        if (/degree|bachelor|master|ph\.?d|b\.?tech|m\.?tech|\bBS\b|\bMS\b|\bBA\b|graduate/i.test(line)) {
          const lv = degreeLevels(line);
          // "Bachelor's or Master's": the lowest listed level is enough.
          if (lv.length) degrees.push(Math.min(...lv));
        }
      }
    }
    for (const id of required) preferred.delete(id);
    const label = (id: string) => labelOf(id, extra);
    return {
      required: [...required].map((id) => ({ id, label: label(id) })),
      preferred: [...preferred].map((id) => ({ id, label: label(id) })),
      years: years.length ? Math.max(...years) : null,
      degree: degrees.length ? Math.min(...degrees) : null,
    };
  }

  // ─── The user ────────────────────────────────────────────────────────────────

  const RANGE_RE = /\b((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d{2})\s*(?:-|–|—|to|until)\s*((?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?((?:19|20)\d{2}|present|current|now|today|date)\b/gi;
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const EDUCATION_LINE = /(university|college|school|institute|academy|bachelor|master|b\.?\s?tech|m\.?\s?tech|b\.?\s?sc|m\.?\s?sc|degree|gpa|cgpa|ph\.?d|class of|semester|coursework)/i;

  function monthIndex(m?: string): number | null {
    if (!m) return null;
    const i = MONTHS.indexOf(m.trim().slice(0, 3).toLowerCase());
    return i >= 0 ? i : null;
  }

  // Years of work from date ranges ("Jan 2021 – Present"), skipping
  // education lines and merging overlapping jobs.
  function yearsFromRanges(text: string, now = new Date()): number | null {
    const spans: Array<[number, number]> = [];
    for (const line of text.split(/\n+/)) {
      if (EDUCATION_LINE.test(line)) continue;
      for (const m of line.matchAll(RANGE_RE)) {
        const start = parseInt(m[2], 10) + (monthIndex(m[1]) ?? 0) / 12;
        const endRaw = m[4].toLowerCase();
        const end = /^\d/.test(endRaw)
          ? parseInt(endRaw, 10) + (monthIndex(m[3]) ?? 11) / 12 + 1 / 12
          : now.getFullYear() + now.getMonth() / 12;
        if (end > start && end - start < 45) spans.push([start, end]);
      }
    }
    if (!spans.length) return null;
    spans.sort((a, b) => a[0] - b[0]);
    let total = 0;
    let [cs, ce] = spans[0];
    for (const [s, e] of spans.slice(1)) {
      if (s <= ce) ce = Math.max(ce, e);
      else { total += ce - cs; [cs, ce] = [s, e]; }
    }
    total += ce - cs;
    return Math.round(total * 10) / 10;
  }

  function userFacts(fields: Record<string, string> = {}, resume = ""): SmartFillUserFacts {
    const skillList = fields.skills || "";
    const extra = userSkillDefs(skillList);
    const corpus = [resume, skillList, fields.job_title, fields.degree].filter(Boolean).join("\n");
    const skills = findSkills(corpus, extra);
    for (const id of [...skills]) for (const implied of IMPLIES[id] || []) skills.add(implied);

    let years: number | null = null;
    let yearsSource: SmartFillUserFacts["yearsSource"] = null;
    const stated = parseFloat(String(fields.experience_years || "").replace(/[^\d.]/g, ""));
    if (Number.isFinite(stated) && stated >= 0 && stated < 50) { years = stated; yearsSource = "profile"; }
    if (years === null && resume) {
      const claims: number[] = [];
      for (const m of resume.matchAll(/\b(\d{1,2})\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:professional\s+|industry\s+|work\s+|hands-on\s+)?experience/gi)) {
        claims.push(parseInt(m[1], 10));
      }
      if (claims.length) { years = Math.max(...claims); yearsSource = "cv"; }
      else {
        const fromRanges = yearsFromRanges(resume);
        if (fromRanges !== null) { years = fromRanges; yearsSource = "dates"; }
      }
    }

    const levels = degreeLevels(`${fields.degree || ""}\n${resume}`);
    return {
      skills: [...skills].map((id) => ({ id, label: labelOf(id, extra) })),
      years,
      yearsSource,
      degree: levels.length ? Math.max(...levels) : null,
      hasData: Boolean(resume.trim() || skillList.trim()),
    };
  }

  // ─── Score ───────────────────────────────────────────────────────────────────

  function score(req: SmartFillRequirements, facts: SmartFillUserFacts): SmartFillMatch {
    const mine = new Set(facts.skills.map((s) => s.id));
    const has = (s: { id: string }) => mine.has(s.id);
    const matched = [...req.required.filter(has), ...req.preferred.filter(has)].map((s) => s.label);
    const missing = req.required.filter((s) => !has(s)).map((s) => s.label);
    const missingPreferred = req.preferred.filter((s) => !has(s)).map((s) => s.label);

    const parts: Array<{ weight: number; value: number }> = [];
    const skillTotal = req.required.length + req.preferred.length * 0.5;
    if (skillTotal > 0) {
      const got = req.required.filter(has).length + req.preferred.filter(has).length * 0.5;
      parts.push({ weight: 0.7, value: got / skillTotal });
    }
    let yearsNote: string | null = null;
    if (req.years !== null) {
      if (facts.years !== null) {
        parts.push({ weight: 0.2, value: Math.min(1, facts.years / req.years) });
        const yours = facts.yearsSource === "dates" ? `about ${facts.years}` : `${facts.years}`;
        yearsNote = `Asks for ${req.years}+ years, you have ${yours}`;
      } else {
        yearsNote = `Asks for ${req.years}+ years — add your experience to compare`;
      }
    }
    let degreeNote: string | null = null;
    if (req.degree !== null) {
      if (facts.degree !== null) {
        const gap = req.degree - facts.degree;
        parts.push({ weight: 0.1, value: gap <= 0 ? 1 : gap === 1 ? 0.5 : 0 });
        degreeNote = gap <= 0
          ? `${DEGREE_LABEL[req.degree]} degree asked — you meet it`
          : `${DEGREE_LABEL[req.degree]} degree asked, you have ${DEGREE_LABEL[facts.degree] || "a lower degree"}`;
      } else {
        degreeNote = `${DEGREE_LABEL[req.degree]} degree asked`;
      }
    }

    const weight = parts.reduce((s, p) => s + p.weight, 0);
    const value = weight > 0 ? Math.round((parts.reduce((s, p) => s + p.weight * p.value, 0) / weight) * 100) : null;
    const signals = req.required.length + req.preferred.length + (req.years !== null ? 1 : 0) + (req.degree !== null ? 1 : 0);
    return {
      score: facts.hasData ? value : null,
      level: value === null || !facts.hasData ? "none" : value >= 75 ? "strong" : value >= 50 ? "partial" : "weak",
      matched, missing, missingPreferred, yearsNote, degreeNote,
      lowConfidence: signals < 3,
      needsProfile: !facts.hasData,
    };
  }

  window.__SMARTFILL__.match = { extractRequirements, userFacts, score, yearsFromRanges };
})();

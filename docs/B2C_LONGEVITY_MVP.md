# Aevum B2C Longevity MVP

**Status:** Product source of truth for the consumer MVP  
**Positioning:** Personalized Biological-Aging Intelligence  
**Product object:** A living Personal Biological Twin

## 1. Product decision

Aevum is a consumer product first. It helps serious, data-aware people understand and improve their healthspan from their own longitudinal data. Clinics may later become a premium distribution or clinician-supported channel, but clinic operations, multi-patient workflows, and EHR integration are not MVP scope.

The MVP must prove one complete loop:

```text
Personal data
  -> Biological Twin
  -> what is changing
  -> what may be contributing
  -> what is worth testing
  -> did it work
  -> updated Twin
```

The MVP is deliberately narrow in data breadth and scientific certainty. It is not narrow in experience: every included user must be able to complete this loop.

## 2. Category, promise, and differentiation

### Category

Personalized Biological-Aging Intelligence.

### Consumer promise

**Understand how your biology is changing, understand what may be driving it, know what is worth changing, and see whether it worked for you.**

### Positioning statement

Aevum connects a person's bloodwork, selected wearable signals, lifestyle and family context, and consumer genotype data into a longitudinal Biological Twin. It identifies high-priority biological patterns, explains their possible relationship to aging biology with visible evidence and uncertainty, ranks practical interventions, and learns from measured response.

### What Aevum is not

- Not a single biological-age score.
- Not a fitness tracker or daily habit tracker.
- Not a generic supplement recommender.
- Not a generic AI chatbot that summarizes a PDF.
- Not a diagnostic, treatment, or prescription service.
- Not a system that claims it can prove the cause of an individual's aging pattern from consumer data.

### Competitive distinction

Blood, DNA, wearable, biological-age, and recommendation products already exist. Aevum must differentiate through the full longitudinal loop:

1. Preserve and normalize the person's actual source data, including historical reports.
2. Show observed signals, personal trends, data quality, and coverage.
3. Form evidence-weighted phenotype and pathway hypotheses instead of presenting a black-box score.
4. Turn recommendations into measured, time-bound experiments.
5. Update the Twin only when new evidence arrives.

The defensible claim is **pathway-first, evidence-visible, response-measured longevity intelligence**. It is not “we know the exact pathway causing your issue” or “we can fix aging.”

## 3. Target user and job to be done

### Primary early user

A healthspan-focused adult who already has, or is willing to obtain:

- longitudinal blood reports;
- a wearable or health-platform account;
- lifestyle and family-history context; and optionally
- a consumer genotype export.

They care about longevity, metabolic health, cardiovascular resilience, recovery, performance, body composition, or a combination. They are willing to retest and want more than a static laboratory report.

### Core job

“Make sense of my scattered health data, tell me the few things that matter now, explain why they matter for my long-term biology, and help me learn whether my changes are helping.”

### Primary user value

- A coherent personal story instead of disconnected reports.
- Clear priorities instead of a wall of biomarkers.
- A visible distinction between measured fact, interpretation, and uncertainty.
- A practical plan with a measurable follow-up window.
- A Twin that becomes more useful over time.

## 4. Scientific contract

### The model hierarchy

```text
Raw source data
  -> normalized observations
  -> biological domains
  -> phenotypes
  -> possible processes and aging relevance
  -> intervention candidates
  -> intervention experiment
  -> response assessment
  -> new Twin version
```

### Required distinctions

Every conclusion must preserve these separate layers:

| Layer | Example | Rule |
| --- | --- | --- |
| Observation | hs-CRP is repeatedly elevated. | Directly traceable to source measurements. |
| Phenotype | Inflammatory burden appears elevated. | Requires convergent, quality-checked evidence. |
| Biological interpretation | Pattern is consistent with increased inflammatory signalling. | Presented as interpretation, never direct proof. |
| Aging relevance | Chronic inflammation is an aging-related biological process. | Has an evidence level and citation. |
| Intervention hypothesis | A sleep or training change may be worth testing. | Must state relevance, risk, evidence, and measurement plan. |
| Response | The intervention appears favorable. | Does not claim causality without adequate design and evidence. |

### Evidence labels

All biology and intervention relationships use one of four labels:

- **Established:** strong human evidence or well-established relationship.
- **Supported:** multiple consistent human studies and mechanistic support.
- **Emerging:** promising but incomplete human evidence.
- **Hypothesis:** plausible but insufficiently validated.

The UI must never present a hypothesis as established fact.

### Confidence labels

Every domain, phenotype, response, and important AI claim includes **high**, **moderate**, or **low** confidence. Confidence is based on data quality, number of relevant signals, personal history, recency, cross-signal agreement, and measurement method. It is not a health score.

### DNA rule

Genomic data provides predisposition and context. It does not itself establish a current biological abnormality, biological age, or diagnosis. The user sees actionable, evidence-qualified genomic context rather than raw-variant overload.

## 5. MVP scope

### Required inputs

| Input | MVP requirement | Notes |
| --- | --- | --- |
| Bloodwork | PDF upload, extracted observations, review/correction, historical reports | Core input; retain original source and extracted values. |
| Wearable data | One live gateway plus supported exports | Normalise only canonical signals the Twin can interpret. |
| Lifestyle | Structured onboarding and periodic updates | Time-stamped facts, not free-text-only notes. |
| Medical context | Age, sex/context, medications, diagnoses, symptoms, allergies, major history | Contextualises interpretation; does not create diagnoses. |
| Family history | Structured conditions and onset context | Risk context only. |
| Consumer genotype | Common genotype-file upload and curated finding extraction | Optional but strategically core. |
| Intervention history | Start, protocol, adherence, target measures, follow-up | Required to close the learning loop. |

### Canonical wearable signals

The MVP interprets only source-qualified signals such as resting heart rate, RMSSD HRV, sleep duration/regularity, steps/activity, exercise sessions, training load, and VO2max where available. Provider-specific scores are not silently relabelled as clinical or canonical measures. SDNN must not be interpreted as RMSSD.

### Core biological domains

The Twin has these stable MVP domains:

1. Metabolic / cardiometabolic
2. Cardiovascular / cardiorespiratory
3. Inflammatory
4. Recovery / resilience
5. Musculoskeletal
6. Functional fitness
7. Body composition
8. Molecular aging, only when appropriate molecular or epigenetic evidence exists

Every domain is visible in the Twin and Biology navigation. A domain with insufficient data says so clearly and lists the available signals; it must not manufacture a state, pathway, or intervention. Liver, kidney, hematology, immune, and nutritional/endocrine measurements remain visible in My Data and may support a core domain, but they are not separate MVP aging-domain products.

### Aging framework

The complete 12-Hallmark taxonomy is a knowledge framework, not twelve claims that the product directly measures. The UI exposes a hallmark only when a supported relationship exists. No direct shortcut from one biomarker to one hallmark is allowed.

### Intervention scope

The MVP ranks interventions from these categories:

- exercise and physical activity;
- sleep and recovery practices;
- nutrition and meal-pattern changes;
- practical lifestyle changes;
- selected supplements when safety and evidence justify inclusion.

Medical treatment, prescription therapies, and experimental gerotherapeutics are educational/contextual only in the consumer MVP. They require appropriate clinician supervision and must never be presented as self-directed treatment protocols.

## 6. The five mandatory product experiences

### 6.1 Home: “What matters now?”

Home is simple and action-oriented. It shows:

- current overall trajectory: improving, stable, mixed, worsening, or insufficient data;
- the three highest-priority items with priority and confidence;
- strengths worth preserving;
- what changed since the last meaningful update;
- the current experiment and its next measurement; and
- a single route into the full Twin.

Home never opens with a wall of measurements, all domains, or an unsupported biological-age number.

### 6.2 My Twin: “Where am I?”

The Twin shows each domain's current state, trend, confidence, coverage, evidence count, and change from the personal baseline. States use qualitative language such as favorable, moderate concern, elevated concern, forming baseline, and insufficient data. The Twin must show strengths as well as weaknesses.

### 6.3 Biology: “Why might this be happening?”

For a supported domain, the Biology page follows:

```text
Observed signals -> phenotype -> possible biological processes -> aging relevance
```

Each node is expandable and exposes supporting measurements, evidence level, confidence, references, limitations, and source provenance. A pathway map appears only where the evidence supports an interpretation. It is a network of possible relationships, not a causal diagram.

### 6.4 Interventions: “What should I test?”

The page presents a small ranked set of options, not a limitless recommendation feed. Every intervention includes:

- why it is relevant to this person;
- evidence level;
- expected measurable outcomes;
- risks, constraints, and contraindication considerations;
- feasibility and burden;
- a measurement window; and
- why it ranked above alternatives.

The primary interaction is **Start experiment**, not “fix yourself.”

### 6.5 Response: “Did it work?”

An experiment progresses through:

```text
Not started -> active -> monitoring -> evaluation due -> evaluated -> continue, modify, or stop
```

Response analysis considers baseline, follow-up, duration, adherence, prior trend, noise, and concurrent changes. It may report favorable, no clear response, inconclusive, or unfavorable. It updates the relevant Twin domains without claiming that overall aging was reversed.

## 7. Onboarding and first-session flow

1. Create account, agree to versioned health, wearable, genomic, and AI-processing consent.
2. Select a primary goal and optional secondary goal. Goals alter intervention ranking, not the underlying Twin.
3. Add data using three plain-language paths:
   - **Connect:** wearable/health platform.
   - **Upload:** blood reports and optional genotype file.
   - **Tell us:** lifestyle, medical context, and family history.
4. Review uncertain extracted data before confirmation.
5. Build the first Twin.
6. Deliver the first “wow” moment:
   - three priorities;
   - a short biological story;
   - what supports each priority;
   - what is unknown; and
   - one high-value next action or measurement plan.

The user must not be required to understand biomarkers, select which markers matter, manually transcribe wearable data, log calories daily, or read papers.

## 8. Information architecture

```text
Home
  - What changed
  - Current priorities
  - Current experiment

My Twin
  - Domain states, trajectory, coverage, strengths

Biology
  - Evidence-backed phenotype and pathway views

Interventions
  - Recommended, active, historical, response

Ask Aevum
  - Grounded questions about the current personal model

My Data
  - Bloodwork, wearables, genetics, lifestyle, family history, source documents, corrections
```

The same information is progressively disclosed:

1. Plain-language takeaway.
2. Supporting changes and measurements.
3. Phenotype interpretation.
4. Possible aging relevance.
5. Evidence, source records, and limitations.

### Ask Aevum behavior

Ask Aevum is the conversational interface to the same personal model, not a separate source of health truth. A user may ask about a biomarker or symptom, food and diet choices, training, sleep, a possible biological pathway, why an intervention ranked, what else could be tried, or whether a personal experiment appears to have helped.

For each question the system builds a consent-gated, question-relevant projection containing the user's verified measurement summaries, wearable trends, reported lifestyle and medical context, curated genomic findings, Twin states, evidence-classified relationships, ranked interventions and experiment history. Source documents, raw genotype rows, account identity and unrelated records are excluded.

The LLM returns a strict structured answer that separates observations, interpretations, practical guidance and uncertainty. Every material claim cites an identifier from the supplied context. The server rejects the complete answer when a citation is missing or fabricated. DNA may explain curated context but may not fill a current measurement gap. Pathways remain plausible interpretations unless directly measured. Food, workout and other practical answers connect the suggestion to the user's goal and signals and include a way to measure response. Medication, diagnosis and urgent-risk questions stay within a clear medical boundary.

Ask has no deterministic chatbot fallback. Missing credentials, provider errors and failed grounding checks produce an honest unavailable state.

## 9. Data, quality, and lineage requirements

### Immutable source layer

Every imported source retains a person identifier, source/provider, content hash, source record identifier, ingestion timestamp, and original file or payload. Sources are never silently overwritten.

### Canonical observations

Downstream intelligence uses canonical observations with concept, value, unit, effective time, source, reference interval, quality status, confidence, and provenance. Vendor naming must not leak into the model; equivalent names such as Apo B, Apolipoprotein B, and ApoB map to one concept.

### Quality gates

Before an observation influences the Twin, validate completeness, units, plausible ranges, dates, duplicates, source consistency, and extraction confidence. Low-confidence PDF extraction requires user review. Missingness must remain explicit.

### Longitudinal analytics

Use interpretable analytics first:

- population reference context;
- personal baseline deviation;
- direction and velocity of trend;
- persistence;
- cross-marker concordance;
- recency and data quality;
- separate time windows for high-frequency wearables and infrequent labs.

No health conclusion may show 100% data availability unless its required canonical signals are actually present and quality-accepted.

## 10. AI contract

AI is an explanation and navigation layer over structured data. It is never the source of truth.

For every important answer, the system retrieves the relevant Twin state, observations, trends, personal context, genomic context where relevant, biological relationships, intervention history, and curated evidence. Important claims carry source observations, relationship/evidence identifiers, confidence, and model version.

The AI can answer:

- Why did my metabolic priority change?
- What supports this biology map?
- Why did this intervention rank first?
- What would increase confidence?
- Did my experiment appear to work?

It must not invent measurements, diagnose disease, present hypotheses as facts, expose raw genotype unnecessarily, or recommend unsafe interventions outside the product's safety policy.

## 11. Technical and privacy requirements

The MVP uses a modular, canonical-data architecture:

```text
Web application
  -> API and identity/consent layer
  -> immutable raw-source storage
  -> validation and normalisation
  -> canonical health model
  -> feature and longitudinal analytics
  -> phenotype, biology, evidence, intervention, and response engines
  -> versioned Twin
  -> grounded AI explanation
```

Required properties:

- PostgreSQL for identity, canonical data, Twin versions, provenance, consent, audit, and relationship tables.
- Time-series storage for wearable measurements and derived features.
- Object storage for original reports and genotype files.
- Versioned Twin, ontology, evidence, and model snapshots.
- Event-driven partial recomputation: a new ApoB result recalculates relevant features, domains, phenotypes, pathways, and interventions, not unrelated data.
- Separate, explicit consent for health, wearables, genomics, AI, and future clinician/research sharing.
- Pseudonymous internal health identity, restricted genomic access, audit events, and secure deletion/revocation handling.
- The external language model receives bounded, authorised, structured context rather than raw source archives by default.

## 12. Explicit non-goals

The following are deliberately outside the consumer MVP:

- clinic organisations, practitioner dashboards, patient sharing, or EHR/FHIR workflows;
- support for every wearable vendor or direct integration for every health platform;
- full clinical whole-genome or whole-exome interpretation;
- proteomics, metabolomics, transcriptomics, microbiome, imaging, CGM, and multiple epigenetic platforms;
- direct measurement of all twelve Hallmarks;
- causal inference or prediction that an intervention will work for an individual;
- prescription, diagnosis, or experimental gerotherapeutic protocols;
- social features, calorie logging, generic coaching feeds, and gamified daily engagement.

These are future extensions. The core user journey does not change as more data or clinical resolution becomes available.

## 13. MVP success criteria

The MVP is ready for its first serious B2C cohort when a user with historical bloodwork, recent wearable data, lifestyle/family context, and optional genotype data can reliably do all of the following:

1. Upload and review source data without losing provenance or inventing measurements.
2. See a complete, understandable Twin with all core domains and honest coverage states.
3. Identify exactly three current priorities, each with evidence and confidence.
4. Explore a supported observation -> phenotype -> possible biology explanation without a false causal claim.
5. Start a safe, evidence-qualified intervention experiment with a measurement plan.
6. Record adherence and follow-up data.
7. Receive a conservative response assessment and a new Twin version.
8. Ask AI questions and inspect the data and evidence behind material answers.

### Product metrics for the first cohort

- Time from upload to reviewed Twin.
- Percentage of imported observations mapped and verified.
- Percentage of users who reach the first three-priority view.
- Percentage who start one experiment.
- Percentage with follow-up measurement within the planned window.
- Percentage who return because a meaningful change occurred.
- User trust: “I understand why this was recommended” and “I can see what the system does not know.”

## 14. Release gate

Do not add more domains, biomarkers, or visual maps merely because data exists. Add a capability only when it strengthens the core loop: more trustworthy observation, clearer priority, better biological explanation, safer intervention selection, or more credible response measurement.

The product should feel like this:

> I have a living model of my biology. It shows what matters, explains what may be going on, helps me test a sensible change, and learns from my response.

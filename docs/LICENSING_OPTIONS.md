# Licensing Options for DungeonGPT-JS

> **This is not legal advice.** This memo is an engineering/strategy analysis prepared to
> frame a decision. Before relicensing, adopting a CLA, or registering a trademark, have a
> lawyer review the specifics.

Decision memo, July 2026. Question: *"The code is public on GitHub. If I run a premium
version on my website, should I change the license?"*

> **DECIDED 2026-07-02: stay Apache-2.0; keep DCO (no CLA).** Premium is protected by
> engineering, not licensing: (1) entitlements move server-side in the CF Worker before
> charging money (issue #39); (2) future premium content ships server-delivered, not in
> the public repo (issue #40); (3) the already-published desert/snow campaigns stay
> premium-gated in the product, accepting the JSON is technically public; (4) revisit
> FSL/AGPL only if a competitor ever rehosts the code commercially.

**Short answer: no, not yet.** Keep Apache-2.0 for the code. The premium tier is protected
by the hosted service and by server-side entitlement enforcement, not by the code license.
The one thing to fix soon is that premium *content* currently lives in the public repo.
Details below.

---

## 1. Current state (verified in-repo)

| Fact | Evidence |
|---|---|
| License: **Apache-2.0** | `LICENSE` (full Apache-2.0 text), `NOTICE` ("Copyright 2024-2026 Edward Thomson"), `README.md` §"License & Attribution" |
| Inbound terms | `CONTRIBUTING.md`: "inbound equals outbound" under Apache-2.0, DCO sign-off + signed commits required |
| Contributors | `git shortlog -sne HEAD`: **one person** (Edward Thomson, 275 commits across two name spellings of the same GitHub identity). **No external contributors.** |
| `package.json` | No `license` field (`"private": true`); cosmetic gap only, `LICENSE` file governs |
| Premium content **in the public repo** | `src/data/storyTemplates.js`: `desert-expedition-t1` and the Frozen Frontier snow campaign, both `premium: true` |
| Entitlement gate | `src/game/entitlements.js`: client-side placeholder; `isPremium()` reads a `localStorage` dev override. No server-side enforcement yet. |
| Positioning depends on the license | `COMPETITORS.md`: "Apache 2.0 open source (this is rare in the field)"; primary wedge is **"verifiable, open-source determinism"**, i.e. "the only AI GM where you can read the dice code"; "No rival can copy the open-source angle without changing their business model." Competitors (AI Dungeon, NovelAI, Friends & Fables) are closed-source. |

Two consequences of sole authorship:

1. **Relicensing is unilaterally possible today.** All copyright is held by one person, so
   the repo can move to any license at any time, no consent-gathering needed.
2. **That window closes with the first merged external PR.** DCO certifies provenance; it
   does **not** assign copyright or grant relicensing rights. After external contributions
   land under "inbound = outbound Apache-2.0", relicensing their code requires each
   contributor's consent (or rewriting their contributions).

Also note the one-way ratchet: versions already published under Apache-2.0 stay
Apache-2.0 forever. A license change only governs future versions; anyone can fork the
last Apache-licensed commit.

## 2. Threat model: what does "premium" actually need protecting?

Where the value sits, from most to least protected:

1. **The hosted service (the real moat).** Accounts, saves, Octonion auth, the Workers AI
   binding (users need no API keys because the maintainer's Cloudflare account pays for
   inference), image generation, the domain, and iteration speed. **No license change
   affects this.** A cloner gets code, not a service: they must bring their own Cloudflare
   account, Workers AI/OpenRouter billing, Supabase project, and replace the Octonion JWKS
   auth. Cloning the repo is easy; cloning the business is not.
2. **Premium entitlements.** Currently a client-side placeholder that any self-hoster (or
   devtools user) flips with one `localStorage` key. This is an *engineering* gap, not a
   licensing gap: the fix is enforcing tier server-side in the Worker (`/api/db/*` and
   `/api/ai` checking a `userTier` claim), per the existing monetization plan.
3. **Premium content.** The desert and snow campaign templates are in the public repo and
   therefore already Apache-licensed: anyone may copy, modify, and resell them, and that
   grant is irrevocable for the published versions. No future license change claws this
   back. Treat them as sunk (demo/marketing for the tier) and decide where *future*
   premium content lives (§4, open-core).
4. **The code itself.** A competitor could launch a paid hosted DungeonGPT clone; Apache-2.0
   fully permits that. Realistically this threat is low at the project's current scale and
   only becomes real if the product succeeds, at which point the incumbent advantages
   (data, users, brand, velocity) matter more than the head start the code gives.
5. **The name.** "DungeonGPT" is not protected by any code license (Apache-2.0 §6
   explicitly excludes trademark rights). Name protection is a separate trademark
   question, and the "GPT" suffix carries its own risk (OpenAI has contested "GPT"-named
   products, though the USPTO refused OpenAI's own "GPT" mark as merely descriptive).

**Bottom line:** the paid tier's defense is (a) server-side entitlements, (b) keeping new
premium content out of the public repo, and (c) the hosted-service moat. The code license
is a secondary lever.

## 3. Options

| Option | What it permits | What it blocks | Open source? | Fit for this project |
|---|---|---|---|---|
| **Apache-2.0 (status quo)** | Everything incl. commercial forks and competing hosted services; patent grant; NOTICE preservation | Trademark use only | Yes (OSI) | **Good now.** Powers the documented "auditable open-source dice" positioning; zero friction; keeps all options open while sole-author |
| MIT | Same freedoms, no patent grant, no NOTICE mechanism | Less than Apache | Yes | Strictly weaker than current; no reason to switch |
| **AGPL-3.0** (optionally + dual license) | Use, self-host, commercial use | Competitors running *modified* versions as a network service without publishing their changes ([FOSSA on AGPL](https://fossa.com/blog/open-source-software-licenses-101-agpl-license/)) | Yes (OSI) | The classic hosted-service defense that *keeps* the open-source claim. As sole copyright holder you could dual-license (community AGPL + commercial/hosted terms). Caveats: does not stop unmodified rehosting; enterprise-averse ([Open Core Ventures](https://www.opencoreventures.com/blog/agpl-license-is-a-non-starter-for-most-companies)); dual-licensing long-term requires a CLA, not just DCO |
| **FSL-1.1-ALv2** (Sentry, Codecov) | Read, use, modify, non-compete commercial use | "Competing use": offering the software as a substitute product/service; each release auto-converts to Apache-2.0 after **2 years** ([fsl.software](https://fsl.software/), [Sentry](https://blog.sentry.io/introducing-the-functional-source-license-freedom-without-free-riding/)) | **No** ("fair source") | Purpose-built for exactly this fear, minimal legalese, time-boxed. But it forfeits the "open source" marketing wedge and chills contributions |
| **BSL 1.1** (MariaDB, HashiCorp) | Like FSL but parameterized: licensor picks the "Additional Use Grant" and a Change Date up to **4 years**, converting to a GPL-compatible license ([MariaDB](https://mariadb.com/bsl11/), [FOSSA](https://fossa.com/blog/business-source-license-requirements-provisions-history/)) | Whatever the custom grant excludes (typically "no competing production/managed service") | No | More flexible, more legal drafting, same perception cost as FSL. FSL is the cleaner pick in this family |
| **Elastic License 2.0** | Use, modify, redistribute | Providing it as a managed service; **circumventing license-key/entitlement functionality**; removing notices ([Elastic](https://www.elastic.co/licensing/elastic-license)) | No | The anti-circumvention clause would legally back the entitlements gate, but no time-boxed conversion, and same "not open source" cost |
| **PolyForm Noncommercial / Strict** | Personal, hobby, research use | *All* commercial use (Noncommercial), or nearly everything (Strict) ([FOSSA guide](https://fossa.com/blog/comprehensive-guide-source-available-software-licenses/)) | No | Overkill: also blocks friendly commercial users, kills contribution incentive |
| **Open-core split** (orthogonal, combinable) | Engine/client stays Apache; premium content + entitlement server logic live in a private repo or under a proprietary/CC-BY-NC content license | Free-riders get the engine but not the paid content | Core: yes | **Recommended as the content fix.** Note: code and content can carry different licenses in the same project; assets/data are not code |
| No license / all-rights-reserved | Nothing (public source ≠ open source; default is all rights reserved) | Everything, ambiguously | No | N/A: the repo already has a license, and this would be the worst signaling option anyway |

Notes on the AI-GM competitive field: per the repo's own `COMPETITORS.md` research, the
profiled competitors are closed-source and monetize hosted subscriptions; being the one
open, auditable engine is the differentiation, not a liability, at this stage.

## 4. Recommendation

**Keep Apache-2.0 for the code. Change engineering and content practices, not the license.**

Reasoning for *this* project's stage (solo dev, pre-revenue, positioning built on
open-source verifiability):

1. **The license change would defend against the wrong threat.** The realistic revenue
   leak today is the client-side entitlement gate and premium content sitting in the
   public repo, and neither is fixed by AGPL/FSL/BSL. The speculative threat (a competitor
   rehosting the code as a paid service) is not worth paying for now, because the price is
   the project's sharpest documented marketing wedge: "the only AI GM where you can read
   the dice code," which only works while the repo is genuinely open source.
2. **The service is the moat.** Bundled AI inference, accounts, auth, and saves cannot be
   cloned by cloning the repo. Comparable products (AI Dungeon, NovelAI) succeed as hosted
   services despite the underlying techniques being replicable.
3. **Optionality stays fully open.** With a single copyright holder, the repo can move to
   AGPL-3.0 or FSL at any time if a real free-rider appears. That option is cheap to hold
   and expensive to need; preserve it (see step 4 below).

### Action items (in order)

1. **Enforce entitlements server-side.** Move the `isPremium()` decision to the CF Worker
   (tier claim on the Octonion JWT / user row, checked in `/api/ai` and `/api/db/*`).
   Keep `src/game/entitlements.js` as the client seam it was designed to be.
2. **Open-core the content, going forward.** Ship future premium campaigns, `very_rare`
   loot tables, and premium prompt packs from a private repo or as server-delivered data,
   optionally under an explicit proprietary or CC-BY-NC content license (code and
   content can be licensed differently). Accept that the already-published desert/snow
   templates are Apache-licensed forever; treat them as the free preview of the premium
   tier, or leave them premium on the hosted service knowing self-hosters get them.
3. **Add `"license": "Apache-2.0"` to `package.json`** (and cf-worker's) for tooling
   hygiene. (Not done in this memo; memo-only task.)
4. **Decide CLA vs DCO *before* merging the first external PR.** This is the real
   licensing deadline. Options: (a) keep DCO and accept that relicensing/dual-licensing
   later needs every contributor's consent, or (b) adopt a lightweight CLA (e.g. a
   cla-assistant flow) granting relicensing rights, at the cost of contributor friction.
   Given the small contributor surface so far, (a) is fine *if* the Apache commitment is
   considered permanent; choose (b) only if AGPL-dual-licensing or FSL later is a serious
   possibility.
5. **Treat the name separately.** If the brand matters, look at a trademark registration
   for the product name, and consider whether "…GPT" naming is worth the trademark
   friction before investing in the brand.

### Escalation path (if a real competitor rehosts the code)

- **Path A, stay open source: AGPL-3.0.** Keeps the OSI "open source" claim and the
  auditability wedge; forces service competitors to publish modifications; enables dual
  licensing while copyright is consolidated. Weakness: doesn't stop verbatim rehosting.
- **Path B, harder block: FSL-1.1-ALv2.** Bans competing services outright for 2 years
  per release, then converts to Apache-2.0 (a good fit with the current license, since
  old releases just become what they already were). Cost: the project must stop calling
  itself open source ("fair source" instead), and the COMPETITORS.md positioning would
  need rewriting.

Either path is a `LICENSE`-swap + `README`/`CONTRIBUTING` update + version-boundary note
("versions ≤ X are Apache-2.0; versions > X are …"), executable in an afternoon *only
while there are no external copyright holders*.

## 5. Open questions

- **CLA or DCO-forever?** (Action item 4; decides whether future dual-licensing stays
  possible.)
- **Are premium campaigns "content" or "code"?** They currently live in `.js` template
  files inside `src/`, which makes the code/content license boundary blurry. If open-core
  is adopted, define the boundary (e.g. premium templates become JSON served by the
  Worker).
- **Does the hosted premium tier keep desert/snow gated** even though the templates are
  public, or do they get demoted to free as the loss-leader once new private premium
  content exists?
- **Trademark:** is "DungeonGPT" worth registering, and is the "GPT" suffix a branding
  risk worth a rename before launch marketing?
- **Third-party asset licenses:** if premium art/audio is added later, its inbound
  licenses must permit commercial hosted use and should be tracked in `CREDITS.md`.

## Sources

- FSL text and rationale: [fsl.software](https://fsl.software/), [Sentry: Introducing the FSL](https://blog.sentry.io/introducing-the-functional-source-license-freedom-without-free-riding/), [TechCrunch coverage](https://techcrunch.com/2023/11/20/with-functional-source-license-sentry-wants-to-grant-developers-freedom-without-harmful-free-riding/)
- BSL 1.1: [MariaDB BSL 1.1](https://mariadb.com/bsl11/), [FOSSA: BSL requirements & history](https://fossa.com/blog/business-source-license-requirements-provisions-history/), [HashiCorp's BSL adoption](https://www.hashicorp.com/en/blog/hashicorp-adopts-business-source-license)
- Elastic License 2.0: [ELv2 text](https://www.elastic.co/licensing/elastic-license), [ELv2 FAQ](https://www.elastic.co/licensing/elastic-license/faq)
- AGPL and SaaS: [FOSSA: the AGPL license](https://fossa.com/blog/open-source-software-licenses-101-agpl-license/), [Mend: the SaaS loophole in GPL](https://www.mend.io/blog/the-saas-loophole-in-gpl-open-source-licenses/), [Open Core Ventures: AGPL is a non-starter for most companies](https://www.opencoreventures.com/blog/agpl-license-is-a-non-starter-for-most-companies)
- Source-available survey: [FOSSA: comprehensive guide to source-available licenses (Heather Meeker)](https://fossa.com/blog/comprehensive-guide-source-available-software-licenses/)
- In-repo: `LICENSE`, `NOTICE`, `README.md`, `CONTRIBUTING.md`, `COMPETITORS.md`, `src/game/entitlements.js`, `src/data/storyTemplates.js`, `git shortlog -sne`

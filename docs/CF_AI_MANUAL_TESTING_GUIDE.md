# Cloudflare Workers AI - Manual Testing Guide
**DungeonGPT Project**  
**Phase 2-4: Multi-Turn Consistency, Comparative Quality, and Stress Testing**

## Overview

This guide covers manual testing phases for evaluating AI models beyond automated protocol compliance. These tests assess narrative quality, consistency, creativity, and edge case handling that require human judgment.

---

## Phase 2: Multi-Turn Consistency Testing

### Objective
Evaluate how well models maintain coherence, setting details, and tone across extended conversations (5-10 turns).

### Test Models
Focus on top performers from automated tests:
- **Primary:** GPT-OSS 20B (recommended)
- **Comparison 1:** Gemma 3 12B
- **Comparison 2:** Llama 3.1 8B Fast
- **Optional:** Llama 3.3 70B (premium tier)
- **Optional:** Granite 4.0 Micro (new addition)

### Test Scenario: "The Cursed Village"

**Setup:**
```
Setting: A war-torn kingdom where undead armies march from the fallen capital
Mood: Grim Intensity
Magic: High Magic
Tech: Medieval
Goal: Destroy the Lich King's phylactery hidden in the Obsidian Citadel
Starting Milestone: Investigate the cursed village of Ashwood

Party:
- Kael (Fighter, Level 5, HP: 60/60)
- Lyra (Wizard, Level 5, HP: 35/35)
- Bram (Cleric, Level 5, HP: 50/50)

Starting Location: Outside Ashwood village (plains biome)
```

**Conversation Flow (10 turns):**

1. **Opening:** DM describes arrival at Ashwood village
2. **Player:** "We enter the village cautiously, looking for survivors"
3. **Player:** "We approach the village elder's house and knock on the door"
4. **Player:** "We ask the elder about the curse and recent undead activity"
5. **Player:** "We investigate the old cemetery at the edge of town"
6. **Combat:** "We're attacked by 3 skeleton warriors. Kael attacks with longsword (rolls 16, hits for 8 damage)"
7. **Player:** "After defeating the skeletons, we search for clues about the source of the curse"
8. **Milestone:** "We find an ancient tome describing a ritual to break the curse. We perform the ritual."
9. **Player:** "With the curse lifted, we ask the villagers about the path to the Obsidian Citadel"
10. **Closing:** "We rest at the inn and prepare to leave at dawn"

### Evaluation Criteria

For each model, score 1-5 on:

#### A. Consistency (1-5)
- **5:** Perfect recall of NPCs, locations, events
- **4:** Minor inconsistencies (e.g., NPC name variation)
- **3:** Some contradictions but recoverable
- **2:** Major inconsistencies (forgets key events)
- **1:** Completely incoherent

**Track:**
- Does model remember the village elder's name?
- Does model recall the cemetery investigation when relevant?
- Does model maintain the "cursed village" theme?

#### B. Tone Consistency (1-5)
- **5:** Maintains "Grim Intensity" throughout
- **4:** Mostly consistent, minor lapses
- **3:** Noticeable tone shifts
- **2:** Frequently breaks tone
- **1:** Completely inconsistent

**Track:**
- Does model maintain dark/grim atmosphere?
- Does model avoid inappropriate humor or lightness?

#### C. Milestone Tracking (1-5)
- **5:** Correctly uses `[COMPLETE_MILESTONE: text]` at appropriate time
- **4:** Uses tag but with minor text variation
- **3:** Acknowledges milestone but doesn't use tag
- **2:** Ignores milestone system
- **1:** Confuses or forgets milestones

#### D. Combat Handling (1-5)
- **5:** Vivid descriptions, tracks HP, asks for next action
- **4:** Good descriptions, minor tracking issues
- **3:** Basic descriptions, functional
- **2:** Vague or confusing combat narration
- **1:** Fails to handle combat properly

#### E. NPC Characterization (1-5)
- **5:** NPCs have distinct personalities, memorable dialogue
- **4:** NPCs are differentiated and believable
- **3:** NPCs are functional but generic
- **2:** NPCs are interchangeable
- **1:** NPCs are poorly characterized or absent

### Testing Template

```markdown
## Model: [Model Name]
**Date:** [Date]
**Tester:** [Your Name]

### Turn-by-Turn Notes
1. Opening: [Notes on quality, atmosphere]
2. Enter village: [Notes]
3. Elder's house: [Notes]
...

### Scores
- Consistency: [1-5] — [Brief justification]
- Tone Consistency: [1-5] — [Brief justification]
- Milestone Tracking: [1-5] — [Brief justification]
- Combat Handling: [1-5] — [Brief justification]
- NPC Characterization: [1-5] — [Brief justification]

**Total Score:** [X/25]

### Notable Strengths
- [Bullet points]

### Notable Weaknesses
- [Bullet points]

### Overall Impression
[2-3 sentence summary]
```

---

## Phase 3: Comparative Quality Testing

### Objective
Compare creative quality and problem-solving across top 3 models using identical scenarios.

### Test Models
- GPT-OSS 20B
- Gemma 3 12B
- Llama 3.1 8B Fast

### Scenario 1: "The Mysterious Artifact"

**Setup:**
```
The party finds a glowing crystal orb in an abandoned tower. 
It pulses with strange energy and seems to whisper in an unknown language.
```

**Player Action:**
```
"Lyra examines the orb with Detect Magic. What does she discover?"
```

**Evaluation:**
- **Creativity (1-5):** How interesting/unique is the artifact's nature?
- **Detail (1-5):** How well-described is the magical effect?
- **Player Agency (1-5):** Does model offer meaningful choices?

### Scenario 2: "The Destroyed Bridge"

**Setup:**
```
The party reaches a river crossing. The bridge has been destroyed. 
The river is wide (50 feet), fast-flowing, and deep. 
On the far side, they can see undead patrols.
```

**Player Action:**
```
"How can we cross the river without alerting the undead?"
```

**Evaluation:**
- **Problem-Solving (1-5):** Does model offer creative solutions?
- **Realism (1-5):** Are solutions plausible within setting?
- **Player Agency (1-5):** Does model present options vs. railroading?

### Scenario 3: "The Nervous Innkeeper"

**Setup:**
```
The party enters a tavern in a small town. 
The innkeeper seems nervous and keeps glancing at a hooded figure in the corner.
```

**Player Action:**
```
"Bram approaches the innkeeper and asks what's troubling him."
```

**Evaluation:**
- **NPC Depth (1-5):** Is the innkeeper believable and interesting?
- **Intrigue (1-5):** Does the scene create compelling mystery?
- **Dialogue Quality (1-5):** Is the dialogue natural and engaging?

### Scenario 4: "The Moral Dilemma"

**Setup:**
```
The party captures a young undead soldier. 
He begs for mercy, claiming he was forced to serve the Lich King through necromancy.
He offers to reveal a secret entrance to the Obsidian Citadel if they spare him.
```

**Player Action:**
```
"What do we do?"
```

**Evaluation:**
- **Moral Complexity (1-5):** Does model present genuine dilemma?
- **Consequences (1-5):** Does model hint at meaningful outcomes?
- **Player Agency (1-5):** Does model respect player choice?

### Comparative Scoring Matrix

| Scenario | Metric | GPT-OSS 20B | Gemma 3 12B | Llama 3.1 8B |
|----------|--------|-------------|-------------|--------------|
| Artifact | Creativity | | | |
| Artifact | Detail | | | |
| Artifact | Player Agency | | | |
| Bridge | Problem-Solving | | | |
| Bridge | Realism | | | |
| Bridge | Player Agency | | | |
| Innkeeper | NPC Depth | | | |
| Innkeeper | Intrigue | | | |
| Innkeeper | Dialogue | | | |
| Dilemma | Moral Complexity | | | |
| Dilemma | Consequences | | | |
| Dilemma | Player Agency | | | |
| **TOTAL** | **/60** | | | |

---

## Phase 4: Stress Testing

### Objective
Test edge cases, long context handling, and error recovery.

### Test 4A: Long Context (20-Turn Conversation)

**Scenario:** Extended dungeon crawl
- Start with opening prompt
- Navigate through 5 rooms
- 3 combat encounters
- 2 puzzle rooms
- 1 NPC interaction
- Milestone completion
- Final treasure room

**Track:**
- At what turn does quality degrade?
- Does model forget earlier events?
- Does response time increase significantly?
- Does model maintain coherence to the end?

**Evaluation:**
- **Context Retention:** Can model recall events from turn 1 at turn 20?
- **Quality Degradation:** Does narrative quality decline over time?
- **Performance:** Does latency increase noticeably?

### Test 4B: Invalid Input Handling

**Test Cases:**

1. **Nonsensical Action:**
   - Input: "I cast fireball at the moon"
   - Expected: Graceful redirection, stays in character

2. **Impossible Request:**
   - Input: "I teleport directly to the Lich King's throne room"
   - Expected: Explains limitations, offers alternatives

3. **Meta-Breaking:**
   - Input: "Can you make the next encounter easier?"
   - Expected: Stays in character as DM, doesn't break immersion

4. **Contradictory Action:**
   - Context: Party is in a town
   - Input: "We attack the dragon in its lair"
   - Expected: Clarifies location, asks for confirmation

**Scoring (per test case):**
- **5:** Perfect in-character handling with helpful redirection
- **4:** Good handling, minor awkwardness
- **3:** Functional but breaks immersion slightly
- **2:** Awkward or confusing response
- **1:** Breaks character or fails to handle

### Test 4C: Rapid Milestone Completion

**Scenario:** 
Present 3 milestones in quick succession (3 turns):
1. "Defeat the dragon" (turn 1)
2. "Retrieve the Oracle's prophecy" (turn 2)
3. "Infiltrate the Obsidian Citadel" (turn 3)

**Track:**
- Does model use `[COMPLETE_MILESTONE: text]` for each?
- Does model maintain narrative quality despite rapid progression?
- Does model acknowledge the quick pace or treat it normally?

### Test 4D: Character Death Scenario

**Setup:**
```
During combat, Kael takes massive damage and drops to 0 HP.
Death saving throws: Fail, Fail, Fail (character dies)
```

**Player Action:**
```
"Bram attempts to revive Kael with his divine magic"
```

**Evaluation:**
- Does model handle character death appropriately?
- Does model respect D&D rules (or adapt gracefully)?
- Does model create emotional weight?
- Does model offer meaningful choices (resurrection, continue without, etc.)?

---

## Testing Schedule Recommendation

### Week 1: Phase 2 (Multi-Turn Consistency)
- **Day 1:** Test GPT-OSS 20B (2 hours)
- **Day 2:** Test Gemma 3 12B (2 hours)
- **Day 3:** Test Llama 3.1 8B Fast (2 hours)
- **Day 4:** Optional: Test Llama 3.3 70B or Granite 4.0 (2 hours)
- **Day 5:** Compile results, create comparison report

### Week 2: Phase 3 (Comparative Quality)
- **Day 1:** Run all 4 scenarios on GPT-OSS 20B (1 hour)
- **Day 2:** Run all 4 scenarios on Gemma 3 12B (1 hour)
- **Day 3:** Run all 4 scenarios on Llama 3.1 8B (1 hour)
- **Day 4:** Score and compare results
- **Day 5:** Create quality comparison report

### Week 3: Phase 4 (Stress Testing)
- **Day 1:** Long context test on top 2 models (2 hours)
- **Day 2:** Invalid input tests on top 2 models (1 hour)
- **Day 3:** Rapid milestone and character death tests (1 hour)
- **Day 4:** Compile stress test results
- **Day 5:** Create final comprehensive report

**Total Time Investment:** ~20-25 hours over 3 weeks

---

## Final Report Template

```markdown
# Cloudflare Workers AI - Comprehensive Model Evaluation
**DungeonGPT Project**

## Executive Summary
[2-3 paragraphs summarizing findings]

## Phase 1: Automated Testing (Basic + Advanced)
- Models tested: [X]
- Scenarios: [Basic: opening, interaction, movement] [Advanced: milestone, combat, town, skill_check, invalid_action]
- Top performers: [List with scores]

## Phase 2: Multi-Turn Consistency
### GPT-OSS 20B
- Total Score: [X/25]
- Strengths: [Bullets]
- Weaknesses: [Bullets]

### Gemma 3 12B
[Same format]

### Llama 3.1 8B Fast
[Same format]

## Phase 3: Comparative Quality
[Scoring matrix with analysis]

## Phase 4: Stress Testing
### Long Context Results
[Summary of findings]

### Edge Case Handling
[Summary of findings]

## Final Recommendations

### Production Deployment
**Primary Model:** [Model name]
- Rationale: [Why]
- Expected performance: [Details]

**Fallback Model:** [Model name]
- Rationale: [Why]
- Use case: [When to use]

### Alternative Configurations
[List 2-3 alternative setups for different priorities]

## Appendices
- Appendix A: Full test transcripts
- Appendix B: Scoring rubrics
- Appendix C: Performance metrics
```

---

## Tools and Resources

### Required
- CF Worker running locally (`npm run dev` in `cf-worker/`)
- Test harness script (`scripts/test-cf-models-simple.mjs`)
- Note-taking template (provided above)
- Spreadsheet for scoring matrix

### Optional
- Screen recording software (to capture test sessions)
- Markdown editor (for report writing)
- Timer (to track latency subjectively)

---

## Tips for Effective Manual Testing

1. **Stay Consistent:** Use the exact same prompts for all models in Phase 3
2. **Take Notes:** Document interesting responses, failures, and surprises
3. **Be Objective:** Score based on rubric, not personal preference
4. **Test Fresh:** Don't test multiple models back-to-back (fatigue affects judgment)
5. **Save Transcripts:** Keep full conversation logs for reference
6. **Look for Patterns:** Note recurring strengths/weaknesses across scenarios
7. **Consider Context:** Remember the model's tier (don't expect 1B to match 20B)

---

## Success Criteria

A model is **production-ready** if it achieves:
- **Phase 1 (Automated):** ≥90% average quality score
- **Phase 2 (Consistency):** ≥20/25 total score
- **Phase 3 (Quality):** ≥45/60 total score
- **Phase 4 (Stress):** Handles all edge cases gracefully (≥4/5 average)

**Minimum acceptable** for production:
- **Phase 1:** ≥80%
- **Phase 2:** ≥16/25
- **Phase 3:** ≥36/60
- **Phase 4:** ≥3/5 average

---

## Next Steps After Testing

1. **Create final recommendation report** (use template above)
2. **Update `llm_constants.js`** with recommended default model
3. **Document model selection rationale** in project docs
4. **Set up monitoring** for production model performance
5. **Plan periodic re-testing** (quarterly) as new models are released

---

## Questions or Issues?

If you encounter unexpected behavior during testing:
1. Check CF Worker logs (`/tmp/cf-worker.log`)
2. Verify model ID is correct in `models.ts`
3. Ensure timeout is sufficient (increase with `--timeout=120`)
4. Document the issue for investigation

Good luck with testing! 🎲

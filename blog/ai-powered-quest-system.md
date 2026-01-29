---

Title: Building an AI-Powered Quest System: Milestone Tracking with LLM Tool Calls
Date: "2026-01-29"
Category: "artificial-intelligence"
Tags: AI, JavaScript, React, OpenAI, Gemini, Game Development, Tool Calls, Quest System
Description: "How we built an intelligent quest tracking system that uses LLM tool calls to automatically detect and celebrate player achievements in DungeonGPT."

---

# Building an AI-Powered Quest System: Milestone Tracking with LLM Tool Calls

## What is DungeonGPT?

**DungeonGPT** is an AI-powered text-based RPG that brings the tabletop gaming experience to your browser. Built with React and powered by modern Large Language Models (OpenAI GPT, Google Gemini, or Anthropic Claude), it allows players to create detailed characters and embark on adventures narrated by an AI dungeon master.

Unlike traditional text adventures with predetermined branching paths, DungeonGPT uses generative AI to respond dynamically to player actions. The AI dungeon master crafts unique narratives, manages combat encounters, tracks character progression, and reacts to the unexpected choices that make tabletop RPGs so engaging.

**Key features include:**

- **Dynamic Character Creation**: Define your hero with custom stats, classes, races, and backgrounds
- **Persistent World**: SQLite database ensures your characters and adventures survive between sessions
- **Multi-Provider AI Support**: Choose between OpenAI, Gemini, or Claude for different narrative styles
- **Interactive Map System**: Navigate an overworld with procedurally described locations
- **Party Management**: Bring multiple characters on adventures and watch them interact

You can watch a [full overview video here](https://youtu.be/CGskdUTQnMo) to see the game in action.

## The Challenge: Teaching AI to Track Progress

As we expanded DungeonGPT beyond simple question-and-response gameplay, we faced a significant design challenge: **How do we teach the AI to recognize when players accomplish important objectives?**

Traditional games have explicit win conditions hardcoded into their logic:
```javascript
if (player.location === "dragon_lair" && dragon.health <= 0) {
    triggerVictory();
}
```

But in a freeform AI-driven narrative, players might defeat the dragon in countless ways:

- "I cast fireball at the dragon!"
- "We sneak around the sleeping beast and steal its treasure"
- "I convince the dragon to become our ally"

The AI needs to understand _intent and outcome_, not just pattern match specific phrases. We needed a system that could:

1. **Understand context**: Know what goals the party is pursuing
2. **Recognize achievement**: Detect when narrative events accomplish those goals
3. **Communicate back**: Signal to the application that a milestone was reached
4. **Stay in character**: Do all this without breaking immersion with technical jargon

## Enter: LLM Tool Calls

The solution came from a powerful feature built into modern LLMs: **tool calling** (also called function calling). This allows the AI to invoke predefined functions as part of its response.

However, we took a simpler approach that doesn't require the full tool calling API infrastructure. Instead, we use **structured text markers** that the AI includes in its narrative responses. Our system then parses these markers to trigger game events.

### The Protocol

We implemented two special tool calls that the AI can use:

#### 1. Milestone Completion
```
[COMPLETE_MILESTONE: exact milestone text]
```

When the AI detects that the party has accomplished a milestone objective, it includes this marker in its response. For example:

> **Player Action:** "We search through the dusty archives of Oakhaven and discover an ancient map hidden behind a false panel!"
>
> **AI Response:** "As you carefully pry away the wooden panel, a yellowed parchment tumbles out. It's the map! Ancient runes mark the path to the Sunfire Vault. [COMPLETE_MILESTONE: Find the hidden map in the archives of Oakhaven] Mayor Thornwick will be amazed by your discovery. What do you do?"

#### 2. Campaign Completion
```
[COMPLETE_CAMPAIGN]
```

This signals that the overarching campaign goal has been achieved:

> **Player Action:** "We defeat the Shadow Overlord in an epic final battle and recover the Crown of Sunfire!"
>
> **AI Response:** "Your blade strikes true! The Shadow Overlord dissolves into shadow as the Crown of Sunfire blazes with golden light. Peace returns to Eldoria. [COMPLETE_CAMPAIGN] The bards will sing of your heroic deeds for generations!"

### Instructing the AI

The magic happens in our dungeon master protocol. Here's how we instruct the AI about these tool calls:

```javascript
export const DM_PROTOCOL = `[STRICT DUNGEON MASTER PROTOCOL]
You are a Dungeon Master for a tabletop RPG. You must ALWAYS stay in character.

MILESTONE TRACKING:
When the party achieves a milestone, you may mark it complete using:
[COMPLETE_MILESTONE: exact milestone text]
This will trigger a celebration and mark the milestone as achieved. 
Only use this when the milestone is truly accomplished.

CAMPAIGN COMPLETION:
When the party achieves the main campaign goal, mark it complete using:
[COMPLETE_CAMPAIGN]
This should ONLY be used when the overarching campaign objective is 
fully accomplished, not for individual milestones.

Failure to follow this protocol breaks player immersion. 
Output only the game's story and dialogue.
[/STRICT DUNGEON MASTER PROTOCOL]
`;
```

This protocol is prepended to every AI request, ensuring consistent behavior.

## Implementation Details

### Context Awareness

Before each AI request, we construct a context string that includes the current quest state:

```javascript
const getMilestoneStatus = (milestones) => {
    const normalized = normalizeMilestones(milestones);
    const completed = normalized.filter(m => m.completed);
    const remaining = normalized.filter(m => !m.completed);
    const current = remaining.length > 0 ? remaining[0] : null;
    
    return { current, completed, remaining };
};

// Generate context for the AI
const context = `
Campaign Goal: Recover the Crown of Sunfire and defeat the Shadow Overlord
Current Milestone: ${milestoneStatus.current.text}
Completed Milestones: ${milestoneStatus.completed.map(m => m.text).join(', ')}
Remaining Milestones: ${milestoneStatus.remaining.slice(1).map(m => m.text).join(', ')}
`;
```

This gives the AI full awareness of:

- What has already been accomplished
- What the party should be working toward next
- What challenges lie ahead

### Detection and Parsing

When the AI responds, we use regex patterns to detect tool call markers:

```javascript
const MILESTONE_COMPLETE_REGEX = /\[COMPLETE_MILESTONE:\s*(.+?)\]/i;
const CAMPAIGN_COMPLETE_REGEX = /\[COMPLETE_CAMPAIGN\]/i;

// Check for milestone completion
const match = response.match(MILESTONE_COMPLETE_REGEX);
if (match) {
    const milestoneText = match[1].trim();
    
    // Find and mark milestone as complete (with fuzzy matching)
    const milestoneIndex = milestones.findIndex(m =>
        m.text.toLowerCase().includes(milestoneText.toLowerCase()) ||
        milestoneText.toLowerCase().includes(m.text.toLowerCase())
    );
    
    if (milestoneIndex !== -1) {
        const updated = [...milestones];
        updated[milestoneIndex].completed = true;
        setMilestones(updated);
        // Trigger celebration UI!
    }
}
```

Notice the **fuzzy matching** approach. The AI might not include the _exact_ milestone text, so we check if either string contains the other. This makes the system more forgiving while still being accurate.

### Visual Feedback

When a milestone is completed, players see immediate visual confirmation (at least on the demo page for now!):

- ✅ **Tool Call Detected** banner with the milestone name
- 🎯 **Progress updates** (e.g., "2/3 Milestones Complete")
- ✓ **Completed milestones** move to a "Completed" section with strikethrough styling
- 🏆 **Campaign Complete** victory badge when the main objective is finished

## Testing the System

We built a dedicated test page (`/milestone-test`) accessible via our debug menu (🐞 button) that allows us to:

1. **Configure the AI provider** (OpenAI, Gemini, Claude)
2. **View current milestone status** with visual indicators
3. **Test player actions** to see if they trigger milestone completion
4. **Preview the exact context** sent to the AI
5. **Inspect AI responses** including raw tool call markers

This made development and iteration much faster. We could rapidly test different phrasing, verify fuzzy matching, and ensure the AI was using tool calls appropriately.

Example test scenarios from our [testing documentation](file:///home/edward/Projects/DungeonGPT-JS/docs/QUEST_MILESTONE_TESTING.md):

**Test: Fuzzy Matching**

- **Input:** "We finally located the Sunfire Vault!"
- **Expected:** Matches "Locate the Sunfire Vault deep within the Cinder Mountains"
- **Result:** ✅ Tool call detected, milestone marked complete

**Test: No False Positives**

- **Input:** "We're still searching for clues about the map's location."
- **Expected:** No tool call (milestone not actually completed)
- **Result:** ✅ AI responds narratively, no milestone change

## Why This Approach Works

### 1. **Natural Integration**
The tool calls feel native to the AI's response. They don't require specialized API features that might vary between providers (OpenAI, Gemini, Claude).

### 2. **Transparent and Debuggable**
The markers are human-readable in the AI response. If something goes wrong, we can immediately see what the AI tried to do.

### 3. **Provider Agnostic**
Because we're using simple text markers rather than proprietary tool calling APIs, this works identically across OpenAI, Gemini, and Claude.

### 4. **Forgiving by Design**
The fuzzy matching ensures that minor variations in AI phrasing don't break the system. The AI doesn't need to remember _exact_ milestone text.

### 5. **Maintains Immersion**
The markers are removed before displaying to the player. They see only the campaign victory message and visual celebration, not the technical instrumentation.

## Lessons Learned

### AI Instruction Design Matters
Our early attempts had vague instructions like "mark milestones when complete." The AI either:

- Ignored the instruction entirely
- Marked milestones too eagerly (false positives)
- Used inconsistent formats

The breakthrough came when we:

- Used **clear, structured markers** with examples
- Emphasized that tool calls should be **rare and meaningful**
- Provided the **exact text format** to use

### Context is Everything
Initially, we only told the AI about the _current_ milestone. This led to confusion when players worked on objectives out of order or mentioned past achievements.

By providing **full quest state** (completed, current, remaining), the AI gained situational awareness and made much better decisions.

### Test Infrastructure Pays Off
Building the dedicated test page early saved countless hours. We could rapidly iterate on:

- Prompt engineering
- Fuzzy matching algorithms
- UI feedback
- Edge cases

Without it, we'd be testing in the full game context every time, which is slow and error-prone.

## Future Enhancements

We're exploring several exciting directions:

### Dynamic Quest Generation
Currently, milestones are defined upfront when creating a campaign. We want to experiment with:

- AI-generated mid-adventure objectives based on player choices
- Branching quest paths that adapt to party decisions  
- Procedural side quests that emerge from the narrative

### Multi-Step Objectives
```
[PROGRESS_MILESTONE: Convince the council, 2/5 votes secured]
```

This would allow tracking partial progress (e.g., recruiting allies, collecting items) rather than binary complete/incomplete states.

### Achievement System
```
[UNLOCK_ACHIEVEMENT: Silver Tongue, convinced enemy to surrender]
```

Meta-game achievements that track interesting player behaviors across multiple campaigns.

### Tool Call Analytics
We're considering adding an analytics dashboard to track:

- How often tool calls are used correctly vs incorrectly
- Which milestones are completed most/least often
- Average campaign completion rates

This data could help us refine prompt engineering and milestone design.

## Conclusion

Building an AI-powered quest system taught us that **LLMs excel at understanding intent**, not just matching patterns. By giving the AI awareness of campaign goals and a simple protocol for communicating achievements, we created a system that:

- ✅ Recognizes player accomplishments in freeform narratives
- ✅ Works across multiple AI providers
- ✅ Maintains narrative immersion
- ✅ Provides satisfying visual feedback

The key insight was treating the AI as a **collaborative partner in quest tracking**, not just a text generator. By providing clear context and simple tools, the AI became genuinely helpful in managing campaign progression.

This approach proves that modern LLMs can do more than generate creative content—they can actively participate in game state management when given the right framework.

If you're building AI-powered games or interactive experiences, consider how tool calls might help your AI "understand" not just _what players say_, but _what they accomplish_.

---

**Want to try DungeonGPT?** Check out the [GitHub repository](https://github.com/EdwardAThomson/DungeonGPT-JS) and watch the [overview video](https://youtu.be/CGskdUTQnMo).

**Questions or ideas?** I'd love to hear how you're using LLMs in game development. What quest mechanics would you build with AI tool calls?

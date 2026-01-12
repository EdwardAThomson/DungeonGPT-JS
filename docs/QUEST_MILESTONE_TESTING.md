# Milestone & Campaign Testing Guide

This document covers testing the Quest milestones. The game has a system that allows the AI to mark whether a milestone has been completed or not.

In the backend is an AI tool call for marking milestones complete.

## Accessing the Test Page

1. **Start the dev server**: `npm start`
2. **Click the debug menu** (🐞 button in bottom-right corner)
3. **Select "🎯 Milestone Test"**

Or navigate directly to: `http://localhost:3000/milestone-test`

---

## Testing Milestones


### Test 1: Complete First Milestone -- hidden map
**Current Milestone**: "Find the hidden map in the archives of Oakhaven"


**Test Input:**

```
We search through the dusty archives of Oakhaven and discover the ancient map hidden behind a false panel!
```

**Expected Results:**
- ✅ AI responds with narrative about finding the map
- ✅ `[COMPLETE_MILESTONE: Find the hidden map in the archives of Oakhaven]` appears in response
- ✅ Green "Tool Call Detected!" box shows
- ✅ Milestone moves to "Completed" section with checkmark
- ✅ Progress updates to "1/3 Complete"
- ✅ Next milestone becomes current


### Test 2: Complete Second Milestone -- convince Silver Guard
**Current Milestone**: "Convince the Silver Guard to join the resistance"

**Test Input:**
```
We present evidence of the Shadow Overlord's crimes to the Silver Guard captain and passionately argue for them to join our cause.
```

**Expected Results:**
- ✅ AI narrates the persuasion attempt
- ✅ Tool call detected for this milestone
- ✅ Progress updates to "2/3 Complete"


### Test 3: Fuzzy Matching -- Sunfire Vault
**Test Input:**
```
We finally located the Sunfire Vault!
```

**Expected Results:**
- ✅ Matches "Locate the Sunfire Vault deep within the Cinder Mountains"
- ✅ Works even with partial text (fuzzy matching)
- ✅ Progress updates to "3/3 Complete"


### Test 4: No False Positives
**Test Input:**
```
We're still searching for clues about the map's location.
```

**Expected Results:**
- ✅ AI responds narratively
- ❌ NO tool call detected
- ❌ Milestone remains incomplete

---


## Testing Campaign Completion


### Test 5: Complete the Campaign
**After completing all milestones** (or independently):

**Test Input:**
```
We defeat the Shadow Overlord in an epic final battle and recover the Crown of Sunfire, restoring peace to all of Eldoria!
```

**Expected Results:**
- ✅ `[COMPLETE_CAMPAIGN]` appears in AI response
- ✅ Green detection box shows "Type: COMPLETE_CAMPAIGN"
- ✅ 🏆 CAMPAIGN COMPLETE badge appears
- ✅ Victory message: "The tale of your heroic deeds will be sung for generations to come!"

### Test 6: Campaign Without All Milestones
**Reset and try completing campaign directly:**

**Test Input:**
```
Through an alternate path, we infiltrate the Shadow Keep and defeat the overlord, recovering the Crown!
```

**Expected Results:**
- ✅ Campaign can complete even if milestones skipped
- ✅ Shows alternate paths are supported

---

## What to Look For

### Success Indicators
- 🟢 **Tool Call in Response**: Look for `[COMPLETE_MILESTONE: ...]` or `[COMPLETE_CAMPAIGN]`
- 🟢 **Detection Box**: Green box appears with tool call details
- 🟢 **Status Updates**: Milestones move between sections
- 🟢 **Progress Counter**: Increments correctly (0/3 → 1/3 → 2/3 → 3/3)
- 🟢 **Visual Feedback**: Checkmarks, strikethrough, badges

### Debug Information
- **Context Preview**: Shows what AI knows about current/completed/remaining milestones
- **Raw AI Response**: Full response including tool calls
- **Console Logs**: Check browser console for `[MILESTONE COMPLETE]` and `[CAMPAIGN COMPLETE]`

---

## Testing Tips

### Best Practices
1. **Be Explicit**: Clear actions get better results
2. **Match Intent**: Action should clearly accomplish the milestone
3. **Check Context**: Review what the AI sees in "Context Sent to AI"
4. **Use Reset**: "Reset All Milestones" button starts fresh

### Common Issues
- **Tool call appears but no update**: Check console for errors
- **AI doesn't use tool call**: Try more explicit completion language
- **Wrong milestone marked**: Fuzzy matching may need adjustment
- **No tool call generated**: AI may not recognize completion

### Example Prompts That Work Well
- ✅ "We found the map!"
- ✅ "The Silver Guard agrees to join us!"
- ✅ "We've located the vault!"
- ✅ "Victory! The Shadow Overlord is defeated!"

### Example Prompts That Don't Work
- ❌ "We're looking for the map" (searching, not finding)
- ❌ "Maybe we should talk to the guards" (planning, not doing)
- ❌ "The vault must be nearby" (speculation, not completion)

---

## Testing Checklist

### Milestone System
- [ ] First milestone completes correctly
- [ ] Second milestone completes correctly
- [ ] Third milestone completes correctly
- [ ] Fuzzy matching works (partial text)
- [ ] No false positives (incomplete actions)
- [ ] Progress counter updates
- [ ] Visual status updates (checkmarks, strikethrough)
- [ ] Reset button works

### Campaign System
- [ ] Campaign completes after all milestones
- [ ] Campaign can complete without all milestones
- [ ] Victory badge appears
- [ ] Victory message displays
- [ ] Settings modal shows completion badge
- [ ] Reset clears campaign completion

### Integration
- [ ] Both systems work together
- [ ] Tool calls don't interfere with each other
- [ ] UI updates correctly for both
- [ ] State persists properly

---

## Troubleshooting

### AI Not Using Tool Calls
**Problem**: AI responds but doesn't include `[COMPLETE_MILESTONE: ...]`

**Solutions**:
- Make the action more explicit
- Try different wording
- Check if AI provider/model supports tool calls
- Review DM_PROTOCOL is being sent

### Tool Call Not Detected
**Problem**: Tool call appears in response but nothing happens

**Solutions**:
- Check browser console for errors
- Verify regex patterns match the format
- Ensure state management is working
- Check for JavaScript errors

### Wrong Milestone Marked Complete
**Problem**: Different milestone than expected gets completed

**Solutions**:
- Review fuzzy matching logic
- Make milestone text more distinct
- Use exact milestone text in prompt
- Adjust matching threshold

---

## Advanced Testing

### Edge Cases
1. **Multiple tool calls in one response**: AI uses both milestone and campaign completion
2. **Invalid tool call format**: Malformed `[COMPLETE_MILESTONE]` tag
3. **Duplicate completions**: Same milestone marked complete twice
4. **Out of order**: Completing milestone 3 before milestone 1

### Performance Testing
- Test with longer AI responses
- Test with multiple rapid completions
- Test with database save/load
- Test with different AI providers

---

## Next Steps After Testing

Once testing is complete:
1. **Document any issues** found
2. **Adjust fuzzy matching** if needed
3. **Refine prompts** for better AI behavior
4. **Add more milestones** to test scalability
5. **Test in actual gameplay** (not just debug page)

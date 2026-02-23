/**
 * HelpModal — how to play information.
 *
 * Ported from src/components/Modals.js HowToPlayModalContent.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/design-system/ui/dialog";
import { useUiStore } from "@/stores/ui-store";

export function HelpModal() {
  const isOpen = useUiStore((s) => s.isHelpModalOpen);
  const setOpen = useUiStore((s) => s.setHelpModalOpen);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        setOpen(open);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>How To Play</DialogTitle>
          <DialogDescription>
            Guide to playing DungeonGPT
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-[var(--text)]">
          <section>
            <h3 className="text-[1.1rem] mb-2">Getting Started</h3>
            <p className="text-[0.9rem] text-[var(--text-secondary)]">
              1. Create characters in the &quot;Create Hero&quot; section.
              <br />
              2. Start a new game from &quot;Start Adventure&quot;.
              <br />
              3. Choose your story template and world settings.
              <br />
              4. Generate a world map.
              <br />
              5. Select your party (1-4 heroes).
            </p>
          </section>

          <section>
            <h3 className="text-[1.1rem] mb-2">During the Game</h3>
            <p className="text-[0.9rem] text-[var(--text-secondary)]">
              Type your actions in the text input and press Enter or
              click Send. The AI Dungeon Master will respond with narrative
              descriptions and present you with choices.
            </p>
          </section>

          <section>
            <h3 className="text-[1.1rem] mb-2">World Map</h3>
            <p className="text-[0.9rem] text-[var(--text-secondary)]">
              Click the Map button to view the world. Click tiles to
              explore. Towns can be entered for detailed exploration.
              Encounters may occur as you travel.
            </p>
          </section>

          <section>
            <h3 className="text-[1.1rem] mb-2">Milestones</h3>
            <p className="text-[0.9rem] text-[var(--text-secondary)]">
              Your campaign has milestones to achieve. The AI will detect
              when you complete them. Complete all milestones and the
              campaign goal to finish the adventure.
            </p>
          </section>

          <section>
            <h3 className="text-[1.1rem] mb-2">Saving</h3>
            <p className="text-[0.9rem] text-[var(--text-secondary)]">
              Your game auto-saves every 30 seconds. You can also click
              the Save button manually. Load saved games from the
              Chronicles page.
            </p>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

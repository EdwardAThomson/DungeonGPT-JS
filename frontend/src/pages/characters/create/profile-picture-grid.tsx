/**
 * ProfilePictureGrid — portrait selection radio grid.
 *
 * Ported from src/pages/CharacterCreation.js profile-pictures section.
 * Filters by selected gender if one is chosen.
 */

import type { CharacterGender } from "@dungeongpt/shared";

import { profilePictures } from "@/data/character-templates";
import { sanitizeImageUrl } from "@/lib/sanitize-url";
import { cn } from "@/lib/utils";


interface ProfilePictureGridProps {
  readonly selectedGender: string;
  readonly selectedPicture: string | null;
  readonly onSelect: (src: string) => void;
}

export function ProfilePictureGrid({
  selectedGender,
  selectedPicture,
  onSelect,
}: ProfilePictureGridProps) {
  const filteredPictures = selectedGender
    ? profilePictures.filter(
        (pic) => pic.gender === (selectedGender as CharacterGender),
      )
    : profilePictures;

  return (
    <div>
      <span className="block mb-2 font-semibold font-[family-name:var(--font-header)] text-[0.85rem] tracking-[0.05em] text-[var(--text-secondary)]">
        Profile Picture:
      </span>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-[15px] justify-start">
        {filteredPictures.map((pic) => (
          <label
            key={pic.imageId}
            className={cn(
              "cursor-pointer border-2 border-transparent rounded-[5px] p-[5px]",
              "transition-[border-color] duration-200 ease-in-out",
              "inline-block leading-[0]",
              "hover:border-[var(--primary)]",
              selectedPicture === pic.src && "border-[var(--primary)]",
            )}
          >
            <input
              type="radio"
              name="profilePicture"
              value={pic.src}
              checked={selectedPicture === pic.src}
              onChange={() => {
                onSelect(pic.src);
              }}
              className="hidden"
            />
            <img
              src={sanitizeImageUrl(pic.src)}
              alt={`Profile ${String(pic.imageId)}`}
              className="w-[100px] h-[100px] object-cover rounded-[4px] block"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

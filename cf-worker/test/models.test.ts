import { describe, it, expect } from "vitest";
import {
  MODEL_REGISTRY,
  DEFAULT_MODEL_ID,
  getModelById,
  getFallbackCandidates,
  getAllModels,
} from "../src/services/models";

describe("model registry", () => {
  it("has a default model that exists in the registry", () => {
    expect(getModelById(DEFAULT_MODEL_ID)).toBeDefined();
  });

  it("has unique model ids", () => {
    const ids = MODEL_REGISTRY.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getModelById resolves a known id and returns undefined for unknown ids", () => {
    expect(getModelById(MODEL_REGISTRY[0].id)?.id).toBe(MODEL_REGISTRY[0].id);
    expect(getModelById("@cf/not/a-model")).toBeUndefined();
  });

  it("getAllModels returns the registry", () => {
    expect(getAllModels()).toEqual(MODEL_REGISTRY);
  });
});

describe("getFallbackCandidates (fallback chain selection)", () => {
  it("puts the default model first when another model failed", () => {
    const failed = MODEL_REGISTRY.find((m) => m.id !== DEFAULT_MODEL_ID)!;
    const candidates = getFallbackCandidates(failed.id);
    expect(candidates[0]).toBe(DEFAULT_MODEL_ID);
  });

  it("never includes the failed model and has no duplicates", () => {
    for (const model of MODEL_REGISTRY) {
      const candidates = getFallbackCandidates(model.id);
      expect(candidates).not.toContain(model.id);
      expect(new Set(candidates).size).toBe(candidates.length);
    }
  });

  it("walks the remaining registry in order after the default", () => {
    const failed = MODEL_REGISTRY.find((m) => m.id !== DEFAULT_MODEL_ID)!;
    const candidates = getFallbackCandidates(failed.id);
    const expected = [
      DEFAULT_MODEL_ID,
      ...MODEL_REGISTRY.map((m) => m.id).filter(
        (id) => id !== failed.id && id !== DEFAULT_MODEL_ID
      ),
    ];
    expect(candidates).toEqual(expected);
  });

  it("when the default itself failed, candidates are the rest of the registry in order", () => {
    const candidates = getFallbackCandidates(DEFAULT_MODEL_ID);
    expect(candidates).toEqual(
      MODEL_REGISTRY.map((m) => m.id).filter((id) => id !== DEFAULT_MODEL_ID)
    );
  });
});

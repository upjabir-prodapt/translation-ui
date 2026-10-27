import { describe, expect, it } from 'vitest';
import { openRunFeedback } from '@aicoe/aihub-platform/ui';
import { translationJobSource } from './jobSource';

describe('translationJobSource', () => {
  it('sends feedback on a run to the AI Hub ticket form, not a dialog of its own', () => {
    expect(translationJobSource.openFeedback).toBe(openRunFeedback);
    expect(translationJobSource.ReviewModal).toBeUndefined();
  });
});

import type { QuestStateSnapshot } from '../protocol/messages';
import { QuestStoryOverlay } from './QuestStoryOverlay';

const QUEST_TRACKER_ROOT_ID = 'dalworld-quest-tracker';

export class QuestTrackerUI {
  private readonly root: HTMLDivElement;
  private readonly storyOverlay = new QuestStoryOverlay();
  private lastSignature = '';

  constructor() {
    this.root = createOrGetRoot();
  }

  render(questState: QuestStateSnapshot | null | undefined): void {
    const activeQuest = questState?.active[0] ?? null;
    this.storyOverlay.sync(activeQuest);

    const signature = JSON.stringify(activeQuest ?? null);
    if (signature === this.lastSignature) return;
    this.lastSignature = signature;

    if (!activeQuest) {
      this.root.hidden = true;
      this.root.innerHTML = '';
      return;
    }

    this.root.hidden = false;
    const objectiveMarkup = activeQuest.objectives.map((objective) => {
      const checked = objective.completed ? '✓' : '□';
      return `
        <li class="quest-tracker__objective ${objective.completed ? 'is-complete' : ''}">
          <span>${checked}</span>
          <strong>${escapeHtml(objective.label)}</strong>
          <em>${objective.current} / ${objective.required}</em>
        </li>
      `;
    }).join('');

    this.root.innerHTML = `
      <section class="quest-tracker__panel" aria-label="Current quest">
        <div class="quest-tracker__eyebrow">메인 목표</div>
        <h2>${escapeHtml(activeQuest.title)}</h2>
        <p>${escapeHtml(activeQuest.description)}</p>
        <ul>${objectiveMarkup}</ul>
      </section>
    `;
  }
}

function createOrGetRoot(): HTMLDivElement {
  let root = document.getElementById(QUEST_TRACKER_ROOT_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = QUEST_TRACKER_ROOT_ID;
    document.body.appendChild(root);
  }
  return root;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

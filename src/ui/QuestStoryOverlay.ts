import type { ActiveQuestSnapshot, QuestCinematicCue } from '../protocol/messages';

const QUEST_STORY_ROOT_ID = 'dalworld-quest-story';
const STORY_DURATION_MS = 5200;
const SEEN_STORAGE_KEY = 'dalworld:seen-quest-story-cues';

type SeenQuestStoryState = Record<string, true>;

export class QuestStoryOverlay {
  private readonly root: HTMLDivElement;
  private currentQuestId: string | null = null;
  private hideTimer: number | null = null;

  constructor() {
    this.root = createOrGetRoot();
    this.root.addEventListener('click', () => this.hide());
  }

  sync(activeQuest: ActiveQuestSnapshot | null | undefined): void {
    if (!activeQuest?.cinematic) return;
    if (this.currentQuestId === activeQuest.id) return;
    this.currentQuestId = activeQuest.id;

    const seen = loadSeenQuestStoryState();
    if (seen[activeQuest.id]) return;

    seen[activeQuest.id] = true;
    saveSeenQuestStoryState(seen);
    this.show(activeQuest.id, activeQuest.cinematic);
  }

  private show(questId: string, cue: QuestCinematicCue): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.root.className = `quest-story quest-story--${cue.cameraCue}`;
    this.root.innerHTML = `
      <div class="quest-story__scrim"></div>
      <section class="quest-story__card" aria-label="Quest story" data-quest-id="${escapeHtml(questId)}">
        <div class="quest-story__eyebrow">새로운 목표</div>
        <h2>${escapeHtml(cue.introTitle)}</h2>
        <p>${escapeHtml(cue.introText)}</p>
        <span class="quest-story__hint">탭하면 닫기</span>
      </section>
    `;
    this.root.hidden = false;
    document.body.classList.remove('quest-camera-wake', 'quest-camera-focus', 'quest-camera-build', 'quest-camera-danger');
    document.body.classList.add(`quest-camera-${cue.cameraCue}`);

    this.hideTimer = window.setTimeout(() => this.hide(), STORY_DURATION_MS);
  }

  private hide(): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }
    this.root.hidden = true;
    document.body.classList.remove('quest-camera-wake', 'quest-camera-focus', 'quest-camera-build', 'quest-camera-danger');
  }
}

function createOrGetRoot(): HTMLDivElement {
  let root = document.getElementById(QUEST_STORY_ROOT_ID) as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = QUEST_STORY_ROOT_ID;
    root.hidden = true;
    document.body.appendChild(root);
  }
  return root;
}

function loadSeenQuestStoryState(): SeenQuestStoryState {
  try {
    const raw = window.sessionStorage.getItem(SEEN_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as SeenQuestStoryState;
  } catch {
    return {};
  }
}

function saveSeenQuestStoryState(state: SeenQuestStoryState): void {
  try {
    window.sessionStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // sessionStorage may be unavailable.
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

import type { TimeOfDayState } from '../systems/timeOfDay/TimeOfDayTypes';

export type TimeOfDayToggleOptions = {
  onToggle: () => void;
};

export class TimeOfDayToggle {
  private readonly root = document.createElement('div');
  private readonly button = document.createElement('button');
  private readonly handleClick = (): void => {
    this.options.onToggle();
  };

  constructor(private readonly options: TimeOfDayToggleOptions) {
    this.root.id = 'dalworld-time-of-day-toggle';
    this.root.className = 'time-of-day-toggle';

    this.button.type = 'button';
    this.button.className = 'time-of-day-toggle-button';
    this.button.addEventListener('click', this.handleClick);

    this.root.appendChild(this.button);
    this.setState({ mode: 'day' });
  }

  mount(parent: HTMLElement): void {
    parent.appendChild(this.root);
  }

  setState(state: TimeOfDayState): void {
    const isNight = state.mode === 'night';
    this.button.textContent = isNight ? '🌙 밤' : '☀️ 낮';
    this.button.setAttribute('aria-pressed', String(isNight));
    this.button.title = isNight ? '낮으로 전환' : '밤으로 전환';
    this.root.classList.toggle('is-night', isNight);
  }

  destroy(): void {
    this.button.removeEventListener('click', this.handleClick);
    this.root.remove();
  }
}

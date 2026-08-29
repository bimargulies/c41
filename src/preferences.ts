const PREFERENCES_KEY = 'c41.preferences';

export type LevelsMode = 'threshold' | 'extreme' | 'knee detection';

const LEVELS_MODES: readonly LevelsMode[] = ['threshold', 'extreme', 'knee detection'];

export interface Preferences {
	detectionMethod: LevelsMode;
	threshold: number;
}

const DEFAULT_PREFERENCES: Preferences = {
	detectionMethod: 'knee detection',
	threshold: 0,
};

export function getPreferences(): Preferences {
	const raw = localStorage.getItem(PREFERENCES_KEY);
	if (!raw) return { ...DEFAULT_PREFERENCES };
	try {
		const merged = { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
		// Fall back to the default when the stored value isn't a recognized mode
		// (e.g. prefs written before the enum existed).
		if (!LEVELS_MODES.includes(merged.detectionMethod)) {
			merged.detectionMethod = DEFAULT_PREFERENCES.detectionMethod;
		}
		return merged;
	} catch {
		return { ...DEFAULT_PREFERENCES };
	}
}

function setPreferences(prefs: Preferences): void {
	localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
}

export async function openC41Preferences() {
	const prefs = getPreferences();

	const dialog = document.createElement('dialog');
	dialog.innerHTML = `
		<style>
			dialog {
				color: var(--uxp-host-text-color, #fff);
				background-color: var(--uxp-host-background-color, #323232);
			}
			form { display: flex; flex-direction: column; gap: 24px; padding: 16px; }
			.row {
				display: flex;
				flex-wrap: nowrap;
				align-items: center;
				gap: 8px;
				color: var(--uxp-host-text-color, #fff);
				background-color: var(--uxp-host-background-color, #323232);
			}
			.buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
			.error { color: #f66; min-height: 1.2em; }
			input[type="number"] {
				flex: 0 0 auto;
				width: 4ch !important;
				min-width: 0 !important;
				max-width: 4ch !important;
				box-sizing: content-box;
				padding: 2px 6px;
				text-align: right;
				color: var(--uxp-host-text-color, #fff);
				background-color: var(--uxp-host-background-color, #323232);
				border: 1px solid var(--uxp-host-border-color, #6e6e6e);
			}
		</style>
		<form>
			<h1 style="margin: 0; color: var(--uxp-host-text-color, #fff); background-color: var(--uxp-host-background-color, #323232);">C41 Preferences</h1>
			<div class="row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
				<label class="row">
					<input type="radio" name="levelsMode" id="modeKneeDetection" value="knee detection" ${prefs.detectionMethod === "knee detection" ? "checked" : ""} />
					Set levels based on automatic knee detection.
				</label>
				<label class="row">
					<input type="radio" name="levelsMode" id="modeExtreme" value="extreme" ${prefs.detectionMethod === "extreme" ? "checked" : ""} />
					Set levels based on the darkest and lightest pixels.
				</label>
				<label class="row">
					<input type="radio" name="levelsMode" id="modeThreshold" value="threshold" ${prefs.detectionMethod === "threshold" ? "checked" : ""} />
					Set levels based on a threshold percentage of total pixel mass.
				</label>
			</div>
			<label class="row">
				Threshold percentage (0-100):
				<input type="number" id="threshold" size="3" min="0" max="100" required value="${prefs.threshold}" />
			</label>
			<div id="thresholdError" class="error"></div>
			<label class="row">
			    (Threshold percentage is only used when "threshold" is selected above.)
			</label>
			<div class="buttons">
				<button id="cancelPreferences" type="button">Cancel</button>
				<button id="okPreferences" type="button">OK</button>
			</div>
		</form>
	`;
	document.body.appendChild(dialog);

	try {
		dialog.querySelector<HTMLButtonElement>('#cancelPreferences')!.addEventListener('click', () => dialog.close());
		dialog.querySelector<HTMLButtonElement>('#okPreferences')!.addEventListener('click', () => {
			const thresholdInput = dialog.querySelector<HTMLInputElement>('#threshold')!;
			const thresholdError = dialog.querySelector<HTMLDivElement>('#thresholdError')!;
			const detectionMethod = dialog.querySelector<HTMLInputElement>('input[name="levelsMode"]:checked')!.value as LevelsMode;
			const threshold = Number(thresholdInput.value);

			if (detectionMethod === 'threshold' && (thresholdInput.value.trim() === '' || !Number.isFinite(threshold) || threshold < 0 || threshold > 100)) {
				thresholdError.textContent = 'Threshold must be a number between 0 and 100.';
				return;
			}
			thresholdError.textContent = '';

			setPreferences({ detectionMethod, threshold: Number.isFinite(threshold) ? threshold : prefs.threshold });
			dialog.close();
		});

		await dialog.uxpShowModal({
			title: 'C41 Preferences',
			resize: 'none',
			size: { width: 480, height: 300 },
		});
	} finally {
		dialog.remove();
	}
}

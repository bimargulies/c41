const PREFERENCES_KEY = 'c41.preferences';

export type LevelsMode = 'extreme' | 'knee detection';

const LEVELS_MODES: readonly LevelsMode[] = ['extreme', 'knee detection'];

export interface Preferences {
	detectionMethod: LevelsMode;
	/** When true, a Screen-blended Curves layer is added below the Invert
	 *  layer to lift a linear/raw scan before inversion. */
	correctGammaForRawScans: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
	detectionMethod: 'knee detection',
	correctGammaForRawScans: false,
};

export function getPreferences(): Preferences {
	const raw = localStorage.getItem(PREFERENCES_KEY);
	if (!raw) return { ...DEFAULT_PREFERENCES };
	try {
		const stored = JSON.parse(raw);
		return {
			detectionMethod: LEVELS_MODES.includes(stored.detectionMethod)
				? stored.detectionMethod
				: DEFAULT_PREFERENCES.detectionMethod,
			correctGammaForRawScans: stored.correctGammaForRawScans === true,
		};
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
			</div>
			<label class="row">
				<input type="checkbox" id="correctGamma" ${prefs.correctGammaForRawScans ? "checked" : ""} />
				Correct gamma for raw scans.
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
			setPreferences({
				detectionMethod: dialog.querySelector<HTMLInputElement>('input[name="levelsMode"]:checked')!.value as LevelsMode,
				correctGammaForRawScans: dialog.querySelector<HTMLInputElement>('#correctGamma')!.checked,
			});
			dialog.close();
		});

		await dialog.uxpShowModal({
			title: 'C41 Preferences',
			resize: 'none',
			size: { width: 480, height: 260 },
		});
	} finally {
		dialog.remove();
	}
}

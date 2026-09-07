const PREFERENCES_KEY = 'c41.preferences';

/** Description of the linear ICC profile bundled with the plugin (see
 *  public/sRGB-elle-V4-g10.icc and the "Install linear scan profile" command).
 *  This is the string Photoshop matches on. */
export const BUNDLED_LINEAR_PROFILE = 'sRGB-elle-V4-g10.icc';

export type LevelsMode = 'extreme' | 'knee detection';

const LEVELS_MODES: readonly LevelsMode[] = ['extreme', 'knee detection'];

export interface Preferences {
	detectionMethod: LevelsMode;
	/** ICC profile name the "Correct Raw Scan Gamma" command assigns as the
	 *  linear source before Convert to Profile → working RGB (must be
	 *  installed; "" disables the command). */
	linearProfileName: string;
}

const DEFAULT_PREFERENCES: Preferences = {
	detectionMethod: 'knee detection',
	linearProfileName: BUNDLED_LINEAR_PROFILE,
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
			linearProfileName:
				typeof stored.linearProfileName === 'string'
					? stored.linearProfileName
					: DEFAULT_PREFERENCES.linearProfileName,
		};
	} catch {
		return { ...DEFAULT_PREFERENCES };
	}
}

function setPreferences(prefs: Preferences): void {
	localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
}

const escapeHtml = (s: string): string =>
	s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));

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
			input[type="text"]#linearProfile {
				flex: 1 1 auto;
				min-width: 0;
				box-sizing: border-box;
				padding: 2px 6px;
				color: var(--uxp-host-text-color, #fff);
				background-color: var(--uxp-host-background-color, #383838);
				border: 1px solid var(--uxp-host-border-color, #6e6e6e);
			}
			.hint { font-size: 0.85em; opacity: 0.7; }
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
			<div class="row" style="flex-direction: column; align-items: flex-start; gap: 8px;">
				<label class="row" style="align-self: stretch;">
					Linear scan profile:
					<input type="text" id="linearProfile" value="${escapeHtml(prefs.linearProfileName)}" placeholder="installed ICC profile name" />
				</label>
				<span class="hint">Used by <b>Correct Raw Scan Gamma</b>. Run <b>Install linear scan profile</b> once to install the bundled default.</span>
			</div>
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
				linearProfileName: dialog.querySelector<HTMLInputElement>('#linearProfile')!.value,
			});
			dialog.close();
		});

		await dialog.uxpShowModal({
			title: 'C41 Preferences',
			resize: 'none',
			size: { width: 480, height: 290 },
		});
	} finally {
		dialog.remove();
	}
}

const PREFERENCES_KEY = 'c41.preferences';

export interface Preferences {
	useThreshold: boolean;
	threshold: number;
}

const DEFAULT_PREFERENCES: Preferences = {
	useThreshold: false,
	threshold: 0,
};

export function getPreferences(): Preferences {
	const raw = localStorage.getItem(PREFERENCES_KEY);
	if (!raw) return { ...DEFAULT_PREFERENCES };
	try {
		return { ...DEFAULT_PREFERENCES, ...JSON.parse(raw) };
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
				width: 4ch;
				color: var(--uxp-host-text-color, #fff);
				background-color: var(--uxp-host-background-color, #323232);
				border: 1px solid var(--uxp-host-border-color, #6e6e6e);
			}
			h3 {
				color: var(--uxp-host-text-color, #fff);
		        background-color: var(--uxp-host-background-color, #323232);
			}
		</style>
		<form>
			<h3 style="margin: 0">C41 Preferences</h3>
			<label class="row">
				<input type="checkbox" id="useThreshold" ${prefs.useThreshold ? "checked" : ""} />
					Set levels based on threshold.
			</label>
			<label class="row">
				Threshold percentage (0-100):
				<input type="number" id="threshold" min="0" max="100" required value="${prefs.threshold}" />
			</label>
			<div id="thresholdError" class="error"></div>
			<label class="row">
			    (If the threshold is disabled, levels will be set based on the darkest and lightest pixels in the image.)
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
			const threshold = Number(thresholdInput.value);

			if (thresholdInput.value.trim() === '' || !Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
				thresholdError.textContent = 'Threshold must be a number between 0 and 100.';
				return;
			}
			thresholdError.textContent = '';

			const useThreshold = dialog.querySelector<HTMLInputElement>('#useThreshold')!.checked;
			setPreferences({ useThreshold, threshold });
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

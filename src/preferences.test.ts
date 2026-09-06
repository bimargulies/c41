import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPreferences, openC41Preferences } from './preferences';

// jsdom doesn't implement <dialog> behavior (close()/open) or UXP's uxpShowModal at all,
// so both are stubbed here to make the dialog's open/close lifecycle deterministic in tests.
beforeEach(() => {
	HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, returnValue?: string) {
		if (returnValue !== undefined) this.returnValue = returnValue;
		this.open = false;
		this.dispatchEvent(new Event('close'));
	};
	HTMLDialogElement.prototype.uxpShowModal = function (this: HTMLDialogElement) {
		this.open = true;
		return new Promise((resolve) => {
			this.addEventListener('close', () => resolve(this.returnValue), { once: true });
		});
	};
});

afterEach(() => {
	localStorage.clear();
	document.body.innerHTML = '';
});

describe('getPreferences', () => {
	it('returns defaults when nothing is stored', () => {
		expect(getPreferences()).toEqual({ detectionMethod: 'knee detection', threshold: 0, correctGammaForRawScans: false });
	});

	it('merges stored values over the defaults', () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ detectionMethod: 'threshold', threshold: 42 }));
		expect(getPreferences()).toEqual({ detectionMethod: 'threshold', threshold: 42, correctGammaForRawScans: false });
	});

	it('falls back to defaults on corrupt stored JSON', () => {
		localStorage.setItem('c41.preferences', '{not json');
		expect(getPreferences()).toEqual({ detectionMethod: 'knee detection', threshold: 0, correctGammaForRawScans: false });
	});

	it('falls back to the default detection method when the stored value is not a recognized mode', () => {
		// prefs written before detectionMethod became an enum (e.g. a stale boolean/string)
		localStorage.setItem('c41.preferences', JSON.stringify({ detectionMethod: 'auto', threshold: 12 }));
		expect(getPreferences()).toEqual({ detectionMethod: 'knee detection', threshold: 12, correctGammaForRawScans: false });
	});

	it('falls back to the default detection method when the stored value is missing', () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ threshold: 7 }));
		expect(getPreferences()).toEqual({ detectionMethod: 'knee detection', threshold: 7, correctGammaForRawScans: false });
	});

	it('returns a stored correctGammaForRawScans of true', () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ correctGammaForRawScans: true }));
		expect(getPreferences().correctGammaForRawScans).toBe(true);
	});

	it('coerces a non-boolean correctGammaForRawScans to false', () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ correctGammaForRawScans: 'yes' }));
		expect(getPreferences().correctGammaForRawScans).toBe(false);
	});
});

describe('openC41Preferences', () => {
	it('pre-fills the form from the currently stored preferences', async () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ detectionMethod: 'threshold', threshold: 55 }));

		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		expect(dialog.querySelector<HTMLInputElement>('#modeThreshold')!.checked).toBe(true);
		expect(dialog.querySelector<HTMLInputElement>('#modeExtreme')!.checked).toBe(false);
		expect(dialog.querySelector<HTMLInputElement>('#modeKneeDetection')!.checked).toBe(false);
		expect(dialog.querySelector<HTMLInputElement>('#threshold')!.value).toBe('55');
		expect(dialog.querySelector<HTMLInputElement>('#correctGamma')!.checked).toBe(false);

		dialog.close();
		await opened;
	});

	it('pre-checks "correct gamma" when it is stored as true', async () => {
		localStorage.setItem('c41.preferences', JSON.stringify({ correctGammaForRawScans: true }));

		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		expect(dialog.querySelector<HTMLInputElement>('#correctGamma')!.checked).toBe(true);

		dialog.close();
		await opened;
	});

	it('saves the "correct gamma" checkbox', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#correctGamma')!.checked = true;
		dialog.querySelector<HTMLButtonElement>('#okPreferences')!.click();
		await opened;

		expect(getPreferences().correctGammaForRawScans).toBe(true);
	});

	it('saves the form values and closes when OK is clicked with a valid threshold', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#modeThreshold')!.checked = true;
		dialog.querySelector<HTMLInputElement>('#threshold')!.value = '42';
		dialog.querySelector<HTMLButtonElement>('#okPreferences')!.click();
		await opened;

		expect(getPreferences()).toEqual({ detectionMethod: 'threshold', threshold: 42, correctGammaForRawScans: false });
		expect(document.querySelector('dialog')).toBeNull();
	});

	it('saves extreme mode without requiring a valid threshold value', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#modeExtreme')!.checked = true;
		dialog.querySelector<HTMLInputElement>('#threshold')!.value = '';
		dialog.querySelector<HTMLButtonElement>('#okPreferences')!.click();
		await opened;

		expect(getPreferences()).toEqual({ detectionMethod: 'extreme', threshold: 0, correctGammaForRawScans: false });
		expect(document.querySelector('dialog')).toBeNull();
	});

	it('saves knee detection mode', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#modeKneeDetection')!.checked = true;
		dialog.querySelector<HTMLButtonElement>('#okPreferences')!.click();
		await opened;

		expect(getPreferences()).toEqual({ detectionMethod: 'knee detection', threshold: 0, correctGammaForRawScans: false });
		expect(document.querySelector('dialog')).toBeNull();
	});

	it('discards changes and closes when Cancel is clicked', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#modeThreshold')!.checked = true;
		dialog.querySelector<HTMLInputElement>('#threshold')!.value = '99';
		dialog.querySelector<HTMLButtonElement>('#cancelPreferences')!.click();
		await opened;

		expect(getPreferences()).toEqual({ detectionMethod: 'knee detection', threshold: 0, correctGammaForRawScans: false });
		expect(document.querySelector('dialog')).toBeNull();
	});

	it('rejects an out-of-range threshold in threshold mode, shows an error, and does not save or close', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#modeThreshold')!.checked = true;
		dialog.querySelector<HTMLInputElement>('#threshold')!.value = '150';
		dialog.querySelector<HTMLButtonElement>('#okPreferences')!.click();

		expect(getPreferences()).toEqual({ detectionMethod: 'knee detection', threshold: 0, correctGammaForRawScans: false });
		expect(document.querySelector('dialog')).not.toBeNull();
		expect(dialog.querySelector('#thresholdError')!.textContent).not.toBe('');

		dialog.close();
		await opened;
	});

	it('rejects an empty threshold in threshold mode, shows an error, and does not save or close', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;

		dialog.querySelector<HTMLInputElement>('#modeThreshold')!.checked = true;
		dialog.querySelector<HTMLInputElement>('#threshold')!.value = '';
		dialog.querySelector<HTMLButtonElement>('#okPreferences')!.click();

		expect(getPreferences()).toEqual({ detectionMethod: 'knee detection', threshold: 0, correctGammaForRawScans: false });
		expect(document.querySelector('dialog')).not.toBeNull();
		expect(dialog.querySelector('#thresholdError')!.textContent).not.toBe('');

		dialog.close();
		await opened;
	});

	it('clears a previous error once a valid threshold is submitted', async () => {
		const opened = openC41Preferences();
		const dialog = document.querySelector('dialog')!;
		const thresholdInput = dialog.querySelector<HTMLInputElement>('#threshold')!;
		const okButton = dialog.querySelector<HTMLButtonElement>('#okPreferences')!;

		dialog.querySelector<HTMLInputElement>('#modeThreshold')!.checked = true;
		thresholdInput.value = '150';
		okButton.click();
		expect(dialog.querySelector('#thresholdError')!.textContent).not.toBe('');

		thresholdInput.value = '50';
		okButton.click();
		await opened;

		expect(getPreferences()).toEqual({ detectionMethod: 'threshold', threshold: 50, correctGammaForRawScans: false });
	});
});
